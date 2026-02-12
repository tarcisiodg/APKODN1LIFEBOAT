
import { GoogleGenAI } from "@google/genai";

export async function generateTrainingSummary(lifeboat: string, crewCount: number, duration: string) {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Gere EXATAMENTE o seguinte texto, preenchendo as informações com os dados fornecidos:
      "O treinamento de segurança na baleeira ${lifeboat} foi concluído com sucesso, contando com a participação dos ${crewCount} tripulantes embarcados e tempo total de ${duration}."
      
      REGRAS:
      1. NÃO use negritos (**).
      2. NÃO use títulos ou marcadores.
      3. NÃO adicione nenhuma outra frase ou introdução.
      4. Retorne APENAS a frase solicitada preenchida.`,
    });

    return response.text?.trim() || `O treinamento de segurança na baleeira ${lifeboat} foi concluído com sucesso, contando com a participação dos ${crewCount} tripulantes embarcados e tempo total de ${duration}.`;
  } catch (error) {
    console.error("Gemini summary error:", error);
    return `O treinamento de segurança na baleeira ${lifeboat} foi concluído com sucesso, contando com a participação dos ${crewCount} tripulantes embarcados e tempo total de ${duration}.`;
  }
}
