import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

let ai: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required but missing.");
    }
    ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return ai;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // API endpoint for Gemini AI computer vision error analysis
  app.post("/api/analyze", async (req, res) => {
    try {
      const { image, autoCount, manualCount, objectsData, method, params } = req.body;
      
      const objectsSummary = objectsData && Array.isArray(objectsData)
        ? objectsData.map((obj: any) => 
            `Обект #${obj.id}: Площ=${obj.area}px, Периметър=${obj.perimeter}px, Кръглост=${obj.circularity.toFixed(2)}, Среден цвят (RGB)=(${obj.avgColor.join(",")}), Клас=${obj.group}`
          ).join("\n")
        : "Липсва информация за детайлните признаци.";

      const prompt = `
Симулирай експертен AI анализатор за системи по Компютърно зрение (Computer Vision).
Потребителят е анализирал изображение със следните настройки и получени резултати:
- Използван метод за сегментиране: ${method || "Неизвестен"}
- Автоматично преброени обекти: ${autoCount}
- Ръчно маркирани/преброени обекти: ${manualCount}
- Разлика в преброяването: ${Math.abs(autoCount - manualCount)} обекта

Детайлни извлечени геометрични и цветови признаци за първите 15 сегментирани обекта:
${objectsSummary}

Напиши задълбочен, професионален и структуриран доклад на БЪЛГАРСКИ език за анализ на изображението.
Докладът трябва да включва следните раздели:
1. **Преглед на точността**: Изчисляване на степента на грешка и оценка дали методът се справя добре.
2. **Анализ на допиращи се и припокриващи се обекти**: Обясни подробно защо се появяват грешки (например слепени обекти, които се броят като един голям обект с по-ниска кръглост, или шумови контури, които се броят за излишни обекти). Свържи това с признака "Кръглост" (Circularity) - например, по-ниската кръглост често издава слепени обекти.
3. **Препоръки за алгоритмично подобрение**: Обясни как параметрите (параметър за Watershed, булев праг, размер на затваряне/отваряне при морфология) могат да се оптимизират за по-добри резултати. Дай конкретни съвети за ползване на Otsu и Watershed.

Пиши на ясен, технически издържан и същевременно лесен за разбиране български език, без излишни хвалебствия. Форматирай отговора в Markdown.
      `;

      let contents: any[] = [prompt];
      
      // If a base64 image chunk is provided, pass it to Gemini for visual verification
      if (image && typeof image === "string" && image.startsWith("data:image")) {
        const base64Data = image.split(",")[1];
        const mimeType = image.split(";")[0].split(":")[1];
        contents.push({
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        });
      }

      const response = await getAiClient().models.generateContent({
        model: "gemini-3.5-flash",
        contents: contents,
      });

      res.json({ report: response.text });
    } catch (error: any) {
      console.error("Gemini analysis error:", error);
      res.status(500).json({ error: error.message || "Грешка при генериране на анализа." });
    }
  });

  // Serve static assets or configure Vite dev server
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
