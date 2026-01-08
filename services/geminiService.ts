import { GoogleGenAI, Type } from "@google/genai";

// --- SESSION MEMORY ---
interface SessionMemory {
    glossary: Record<string, string>;
    lastSummary: string;
}

let sessionMemory: SessionMemory = {
    glossary: {},
    lastSummary: "Start of chapter."
};

export const resetSessionMemory = () => {
    console.log("Session memory reset.");
    sessionMemory = { glossary: {}, lastSummary: "Start of chapter." };
};

// --- HELPERS ---

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

const getImageDimensions = (base64Image: string, mimeType: string): Promise<{width: number, height: number}> => {
    return new Promise((resolve) => {
        const i = new Image();
        i.onload = () => resolve({width: i.naturalWidth, height: i.naturalHeight});
        i.src = `data:${mimeType};base64,${base64Image}`;
    });
};

/**
 * Checks if the image has enough visual complexity to warrant translation.
 * Skips solid colors (gutters) or very low variance images.
 * This prevents the "Gray Scan Bug" where AI hallucinates on empty space.
 */
const isComplexImage = async (base64: string, mimeType: string): Promise<boolean> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            // Analyze a small thumbnail is enough
            canvas.width = 100;
            canvas.height = 100;
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(true); return; } 
            
            ctx.drawImage(img, 0, 0, 100, 100);
            const data = ctx.getImageData(0, 0, 100, 100).data;
            
            // Calculate Variance
            let sum = 0;
            // Sampling pixels to speed up
            let count = 0;
            for (let i = 0; i < data.length; i += 16) {
                sum += (data[i] + data[i+1] + data[i+2]) / 3;
                count++;
            }
            const avg = sum / count;
            
            let variance = 0;
            for (let i = 0; i < data.length; i += 16) {
                const val = (data[i] + data[i+1] + data[i+2]) / 3;
                variance += Math.pow(val - avg, 2);
            }
            variance /= count;
            
            // Threshold: 
            // Solid color variance is ~0. 
            // Dirty paper scan might be ~5-10. 
            // Real art is usually > 500.
            // INCREASED THRESHOLD to 100 to catch "gray paper" noise.
            console.log(`Image Variance: ${variance.toFixed(2)}`);
            resolve(variance > 100); 
        };
        img.src = `data:${mimeType};base64,${base64}`;
    });
};

// --- MATH SCANNERS (The "Surgeon" Logic) ---

const calculateRowEnergy = (data: Uint8ClampedArray, width: number, y: number): { energy: number, brightness: number } => {
    let diffSum = 0;
    let brightnessSum = 0;
    const STRIDE = 2; 

    const rowOffset = y * width * 4;

    for (let x = 0; x < width - STRIDE; x += STRIDE) {
        const i = rowOffset + x * 4;
        const nextI = rowOffset + (x + STRIDE) * 4;

        brightnessSum += (data[i] + data[i+1] + data[i+2]) / 3;
        
        const dR = Math.abs(data[i] - data[nextI]);
        const dG = Math.abs(data[i+1] - data[nextI+1]);
        const dB = Math.abs(data[i+2] - data[nextI+2]);
        diffSum += dR + dG + dB;
    }

    const count = Math.ceil(width / STRIDE);
    return {
        energy: diffSum / count,
        brightness: brightnessSum / count
    };
};

const findExactCutInZone = (
  ctx: CanvasRenderingContext2D,
  width: number,
  startY: number,
  endY: number
): number => {
  if (startY >= endY) return startY;

  const height = endY - startY;
  const imgData = ctx.getImageData(0, startY, width, height);
  const data = imgData.data;

  let bestY = -1;
  let minEnergy = Infinity;
  
  for (let y = 0; y < height; y++) {
      const { energy, brightness } = calculateRowEnergy(data, width, y);
      
      let score = energy; // Lower is better
      
      // Bonus for White/Black gutters
      if (brightness > 240 || brightness < 20) {
          score -= 30; // Increased bonus for clean gutters
      }

      // Center Bias - prefer cutting in the middle of the provided safe zone
      const distFromCenter = Math.abs(y - height/2) / (height/2);
      score += distFromCenter * 0.5;

      if (score < minEnergy) {
          minEnergy = score;
          bestY = y;
      }
  }

  return startY + bestY;
};

// --- HYBRID SLICING LOGIC ---

const getAiSafeZones = async (base64: string, mimeType: string): Promise<{start_percent: number, end_percent: number, type: string}[]> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const prompt = `
    Analyze this vertical manhwa strip.
    Task: Identify horizontal "Safe Zones" where I can slice the image.
    
    CRITICAL RULES:
    1. NEVER cut through Sound Effects (SFX) - large letters like "WHAM", "AAAA".
    2. NEVER cut through Speech Bubbles or Text Boxes.
    3. NEVER cut through Character Faces.
    
    Prioritize:
    1. Gutters (spaces between panels).
    2. Blurry/Static backgrounds (sky, ground) if no gutters exist.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
                parts: [
                    { inlineData: { data: base64, mimeType } },
                    { text: prompt }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            start_percent: { type: Type.NUMBER, description: "0.0 to 1.0" },
                            end_percent: { type: Type.NUMBER, description: "0.0 to 1.0" },
                            type: { type: Type.STRING, enum: ["gutter", "safe_background"] }
                        },
                        required: ["start_percent", "end_percent", "type"]
                    }
                }
            }
        });
        
        return JSON.parse(response.text || "[]");
    } catch (e) {
        console.warn("AI Vision Slicing failed, falling back to pure algorithm.", e);
        return [];
    }
};

export const splitLongImage = (file: File): Promise<File[]> => {
  return new Promise(async (resolve, reject) => {
    const base64 = await fileToBase64(file);
    const img = new Image();
    img.src = `data:${file.type};base64,${base64}`;

    img.onload = async () => {
      const TARGET_CHUNK_HEIGHT = 2500; 
      
      if (img.height <= TARGET_CHUNK_HEIGHT * 1.2) {
          resolve([file]);
          return;
      }

      console.log(`Starting Hybrid AI Slicing for ${file.name}...`);

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) { reject(new Error("No Context")); return; }
      ctx.drawImage(img, 0, 0);

      // 1. Get AI Suggestions
      const zones = await getAiSafeZones(base64, file.type);
      console.log(`AI found ${zones.length} safe zones.`);
      
      const splitPoints: number[] = [0];
      let currentY = 0;
      
      while (currentY < img.height) {
          const desiredCutY = currentY + TARGET_CHUNK_HEIGHT;
          if (desiredCutY >= img.height) break; 
          
          let cutY = -1;

          // 2. Select Best Zone
          const validZones = zones.filter(z => {
             const zMid = (z.start_percent + z.end_percent) / 2 * img.height;
             return zMid > currentY + 100;
          });

          if (validZones.length > 0) {
             const bestZone = validZones.reduce((prev, curr) => {
                const prevMid = (prev.start_percent + prev.end_percent) / 2 * img.height;
                const currMid = (curr.start_percent + curr.end_percent) / 2 * img.height;
                const prevDist = Math.abs(prevMid - desiredCutY);
                const currDist = Math.abs(currMid - desiredCutY);
                return currDist < prevDist ? curr : prev;
             });

             const zoneMid = (bestZone.start_percent + bestZone.end_percent) / 2 * img.height;
             
             // Relaxed distance check to allow cuts further away if it means a safer cut
             if (Math.abs(zoneMid - desiredCutY) < 1800) {
                 const zStartPx = Math.floor(bestZone.start_percent * img.height);
                 const zEndPx = Math.floor(bestZone.end_percent * img.height);
                 cutY = findExactCutInZone(ctx, img.width, zStartPx, zEndPx);
                 console.log(`AI Zone used: ${zStartPx}-${zEndPx}, Cutting at ${cutY}`);
             }
          }

          if (cutY === -1) {
              console.log("No AI zone near target. Using Math Fallback.");
              const searchStart = Math.max(currentY + 100, desiredCutY - 300);
              const searchEnd = Math.min(img.height - 10, desiredCutY + 300);
              cutY = findExactCutInZone(ctx, img.width, searchStart, searchEnd);
          }

          if (cutY <= currentY) cutY = currentY + TARGET_CHUNK_HEIGHT;
          
          splitPoints.push(cutY);
          currentY = cutY;
      }

      splitPoints.push(img.height);
      const uniquePoints = [...new Set(splitPoints)].sort((a,b) => a-b);

      // 3. Generate Chunks
      const chunks: File[] = [];
      for (let i = 0; i < uniquePoints.length - 1; i++) {
          const y1 = uniquePoints[i];
          const y2 = uniquePoints[i+1];
          const h = y2 - y1;
          
          // INCREASED MIN HEIGHT: Avoid tiny slivers that confuse the AI
          if (h < 100) continue; 

          const chunkCanvas = document.createElement('canvas');
          chunkCanvas.width = img.width;
          chunkCanvas.height = h;
          const cCtx = chunkCanvas.getContext('2d');
          if (cCtx) {
              cCtx.drawImage(canvas, 0, y1, img.width, h, 0, 0, img.width, h);
              const blob = await new Promise<Blob | null>(r => chunkCanvas.toBlob(r, file.type, 0.95));
              if (blob) {
                  const partName = file.name.replace(/(\.[\w\d_-]+)$/i, `_part_${i+1}$1`);
                  chunks.push(new File([blob], partName, { type: file.type }));
              }
          }
      }
      
      resolve(chunks);
    };
    img.onerror = (e) => reject(e);
  });
};


// --- TRANSLATION PIPELINE ---

const analyzeAndPrepare = async (base64Image: string, mimeType: string, targetLang: 'ru' | 'en'): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const langName = targetLang === 'ru' ? 'Russian' : 'English';
    
    const prompt = `
    Role: Lead Manhwa Translator & Editor.
    
    CURRENT MEMORY:
    - Glossary (Terms/Names established): ${JSON.stringify(sessionMemory.glossary)}
    - Previous Context: "${sessionMemory.lastSummary}"

    TASK:
    1. **Scan Exhaustively**: Look for EVERY speech bubble, thought bubble, square narration box, and floating text.
    2. **Translate**: Translate all text to ${langName}. 
       - USE the Glossary to maintain consistency.
       - If you encounter a NEW character name or term, translate it and add it to the 'new_glossary' field.
       - Style: Natural flow, slang where appropriate.
    3. **Summarize**: Provide a 1-sentence summary of what happened on this specific page for the next context.
    4. **Instruction Generation**: Write a detailed instruction block for an Image Generation model to replace the text.
       - IMPORTANT: Do not miss small bubbles or text outside bubbles.
       - List EVERY piece of text found.
    
    OUTPUT JSON:
    {
        "new_glossary": { "Name": "Translation" },
        "page_summary": "...",
        "image_gen_instruction": "A structured string listing every bubble's ${langName} text and visual style (e.g., 'Bubble 1 (Top Left): [Text] - Bold Font')."
    }
    `;

    try {
        console.log(`Step 1: Flash Context Analysis (Target: ${langName})...`);
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
                parts: [
                    { inlineData: { data: base64Image, mimeType } },
                    { text: prompt }
                ]
            },
            config: { responseMimeType: "application/json" }
        });

        const result = JSON.parse(response.text || "{}");
        
        if (result.new_glossary) {
            sessionMemory.glossary = { ...sessionMemory.glossary, ...result.new_glossary };
        }
        if (result.page_summary) {
            sessionMemory.lastSummary = result.page_summary;
        }

        return result.image_gen_instruction || `Detect text and translate to ${langName}.`;

    } catch (e) {
        console.error("Flash Analysis Error:", e);
        return `Detect text and translate to ${langName} (Context Analysis Failed).`;
    }
};


export const translateMangaPage = async (
  base64Image: string,
  mimeType: string,
  targetLang: 'ru' | 'en'
): Promise<string> => {
  const { width, height } = await getImageDimensions(base64Image, mimeType);

  // PRE-FLIGHT CHECK: Avoid sending empty/gutter images to AI
  const isWorthTranslating = await isComplexImage(base64Image, mimeType);
  if (!isWorthTranslating) {
      console.log("Skipping AI translation for low-variance chunk (probably gutter).");
      return `data:${mimeType};base64,${base64Image}`;
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const langName = targetLang === 'ru' ? 'Russian' : 'English';
  
  // 1. Run Flash Pipeline
  const instructions = await analyzeAndPrepare(base64Image, mimeType, targetLang);

  // 2. Select Ratio
  const ratio = width / height;
  const supportedRatios = [
    { val: 1.0, label: "1:1" },
    { val: 0.75, label: "3:4" },
    { val: 1.33, label: "4:3" },
    { val: 0.5625, label: "9:16" },
    { val: 1.77, label: "16:9" }
  ];
  const bestRatio = supportedRatios.reduce((prev, curr) => 
    Math.abs(curr.val - ratio) < Math.abs(prev.val - ratio) ? curr : prev
  );

  console.log("Step 2: Pro Image Generation...");

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image,
              mimeType: mimeType,
            },
          },
          {
            text: `ROLE: Elite Manga Editor.
TASK: Replace text bubbles with ${langName} translations.

INSTRUCTIONS:
${instructions}

CRITICAL CONSTRAINTS (DO NOT VIOLATE):
1. **PIXEL PERFECT BACKGROUND**: The background, characters, and panel borders MUST be identical pixel-for-pixel to the source. Do not regenerate the art. Only modify the pixels inside the speech bubbles.
2. **NO ZOOM / NO CROP**: The output image MUST represent the exact same framing and scale as the original.
3. **ZERO TOLERANCE FOREIGN TEXT**: You must aggressively erase ALL foreign text (anything that is NOT ${langName}) found in bubbles and replace it with ${langName}.
4. **ONLY TEXT**: Your ONLY job is to erase the foreign text and write the ${langName} text.

If a bubble is cut off by the edge, KEEP IT CUT OFF. Do not invent the rest of the bubble.

Output only the result image.`,
          },
        ],
      },
      config: {
        imageConfig: {
          imageSize: "2K", 
          aspectRatio: bestRatio.label 
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    throw new Error("No image returned from Gemini.");
  } catch (error) {
    console.error("Error translating page:", error);
    throw error;
  }
};

export const stitchTranslatedPages = async (imageUrls: string[]): Promise<string[]> => {
    if (imageUrls.length === 0) return [];
    
    const images = await Promise.all(imageUrls.map(url => new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
        img.src = url;
    })));

    if (images.length === 0) return [];

    const maxWidth = Math.max(...images.map(img => img.naturalWidth));
    const MAX_CANVAS_HEIGHT = 16384; 
    const resultUrls: string[] = [];
    
    let currentBatch: { img: HTMLImageElement, height: number }[] = [];
    let currentHeight = 0;

    const renderBatch = () => {
         if (currentBatch.length === 0) return;
         const canvas = document.createElement('canvas');
         canvas.width = maxWidth;
         canvas.height = currentHeight;
         const ctx = canvas.getContext('2d');
         if (!ctx) return;
         
         let y = 0;
         for (const item of currentBatch) {
             ctx.drawImage(item.img, 0, y, maxWidth, item.height);
             y += item.height;
         }
         resultUrls.push(canvas.toDataURL('image/png'));
    };

    for (const img of images) {
        const scale = maxWidth / img.naturalWidth;
        const h = Math.floor(img.naturalHeight * scale);
        
        if (currentHeight + h > MAX_CANVAS_HEIGHT) {
            renderBatch();
            currentBatch = [];
            currentHeight = 0;
        }
        
        currentBatch.push({ img, height: h });
        currentHeight += h;
    }
    renderBatch();
    return resultUrls;
};
