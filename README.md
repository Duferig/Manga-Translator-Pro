# 🎌 Manga Translator Pro

**Manga Translator Pro** is a modern web application for automatically translating manga and manhwa (webtoons) while preserving the original art style.

The application leverages Google's latest multimodal **Gemini 3 (Nano Banana Pro)** models to recognize text, understand context, and repaint speech bubbles (in-painting) on the fly.

---

## ✨ Features

### 🧠 Advanced AI
*   **Gemini 3 Pro (Nano Banana Pro)**: Used for the final rendering. The model "erases" foreign text and seamlessly blends the translated text into the speech bubbles, preserving the background art, paper texture, and original style (Pixel Perfect).
*   **Context Aware**: The app "remembers" character names and specific terminology across pages within a chapter, creating a temporary glossary to ensure translation consistency.

### 🔪 Smart Hybrid Slicing (for Manhwa)
Long vertical webtoon strips are often too large for AI models to process in one go. We use a hybrid approach:
1.  **AI Vision**: Gemini 3 Flash scans the image to identify "safe zones" (gutters between panels, static backgrounds) where a cut can be made without slicing through faces or text.
2.  **Algorithmic Precision**: A mathematical algorithm analyzes pixel energy in the suggested zones to execute a perfectly clean cut.

### 🛠 Core Functionality
*   **File Support**: Upload `.jpg`, `.png`, or `.webp` files.
*   **Modes**:
    *   *Manga*: Processes pages as whole images.
    *   *Manhwa*: Automatically slices long vertical strips into chunks and stitches them back together.
*   **Export**:
    *   Download the full chapter as a single **PDF**.
    *   Download as a stitched **Long Strip** (PNG).
*   **Multi-language**: UI and Target Translation available in **English** and **Russian**.

---

## 🚀 How It Works (Under the Hood)

1.  **Upload**: You upload the files. If "Manhwa" mode is selected, files are automatically analyzed and sliced.
2.  **Analysis (Flash Pipeline)**:
    *   The lightweight `gemini-3-flash` model scans the page.
    *   It detects all text, translates it (referencing the session glossary), and generates detailed instructions for the image generator.
3.  **Generation (Pro Pipeline)**:
    *   The powerful `gemini-3-pro-image-preview` model receives the image and the instructions.
    *   It generates a new version of the image where the original text is erased and replaced with the translation.
4.  **Assembly**: The processed chunks are stitched back together or compiled into a PDF.

---

## 🛠 Installation & Setup

You will need [Node.js](https://nodejs.org/) installed on your machine.

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/manga-translator-pro.git
    cd manga-translator-pro
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Start the application:**
    ```bash
    npm start
    ```

The app will open in your browser at `http://localhost:3000`.

---

## 🔑 API Key

**A Google Gemini API Key is required.**

This application runs entirely on the client-side (in your browser). Your API key is **never saved** to any server and is only used for direct requests to the Google API during your active session.

Upon launching the app, you will be prompted to select a key via the secure Google AI Studio interface. Ensure you have access to the `gemini-3-pro-image-preview` model series.

---

## 📦 Tech Stack

*   **Frontend**: React 19, TypeScript, Vite (or CRA).
*   **Styling**: TailwindCSS.
*   **AI SDK**: Google GenAI SDK (`@google/genai`).
*   **PDF Generation**: jsPDF.

---

## ⚠️ Disclaimer

This project was created for educational purposes to demonstrate the capabilities of Gemini's multimodal models. The quality of translation and in-painting depends on the complexity of the source material.

The author is not responsible for any copyright infringement resulting from the use of this tool. Please support manga authors by purchasing official releases.
