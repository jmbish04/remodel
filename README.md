# Interior Design Studio (AI-Powered)

A React-based web application that leverages Google's **Gemini 2.5 Flash** model to transform technical 2D floorplans into photorealistic 3D renders, interior perspectives, and cinematic video frames.

This application is designed to be hosted on the **Cloudflare Ecosystem** (Workers/Pages).

## ⚡ Features

* **Floorplan Conversion:** Instantly turn 2D schematics into isometric or top-down 3D models.
* **Interior Visualization:** "Step inside" the room with first-person photorealistic rendering.
* **Natural Language Editing:** Modify the design (e.g., "add a red sofa") using text instructions.
* **Cinematic Preview:** Generate high-motion-blur frames to simulate video walkthroughs.
* **Gemini 2.5 Flash:** powered by the `gemini-2.5-flash-image-preview` model for low-latency image generation.

## 🛠 Tech Stack

* **Frontend:** React (Vite)
* **Styling:** Tailwind CSS
* **Icons:** Lucide React
* **AI Provider:** Google Gemini API
* **Hosting:** Cloudflare Pages (Asset hosting) / Cloudflare Workers (Optional backend proxy)

## 🚀 Local Development

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd interior-design-studio
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment:**
    Create a `.env.local` file and add your Gemini API key:
    ```env
    VITE_GEMINI_API_KEY=your_google_api_key_here
    ```
    *Note: The current codebase expects the key injected or replaced in `App.jsx`. For production, ensure strictly managed environment variables.*

4.  **Run Development Server:**
    ```bash
    npm run dev
    ```

## ☁️ Deployment (Cloudflare)

This project is optimized for **Cloudflare Pages**.

1.  **Build the project:**
    ```bash
    npm run build
    ```

2.  **Deploy using Wrangler:**
    ```bash
    npx wrangler pages deploy dist --project-name interior-design-studio
    ```

### Environment Variables on Cloudflare
Go to your Cloudflare Dashboard > Pages > `interior-design-studio` > Settings > Environment Variables and add:
* `VITE_GEMINI_API_KEY`: [Your Key]

## 📝 Usage Pipeline

1.  **Upload:** Drag and drop a clear 2D floorplan (JPG/PNG).
2.  **3D Model:** Select perspective (Isometric/Top-down) and style.
3.  **Interior:** Select a specific room to visualize.
4.  **Refine:** Use text prompts to add/remove furniture or change styles.
5.  **Video:** Generate a cinematic keyframe.
