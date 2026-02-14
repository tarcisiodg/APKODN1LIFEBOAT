import { GoogleGenAI } from "@google/genai";

export async function generateTrainingSummary(lifeboat: string, crewCount: number, duration: string) {
  try {
    // The API key must be obtained directly from process.env.API_KEY.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{
        parts: [{
          text: `Gere um resumo formal (em português) para o seguinte cenário:
          Baleeira: ${lifeboat}
          Tripulantes: ${crewCount}
          Duração: ${duration}
          
          REGRAS: Retorne apenas o parágrafo preenchido, sem negritos ou introduções.`
        }]
      }]
    });

    // Directly access the .text property on the response object.
    return response.text?.trim() || `O treinamento de segurança na baleeira ${lifeboat} foi concluído com sucesso, contando com a participação dos ${crewCount} tripulantes embarcados e tempo total de ${duration}.`;
  } catch (error) {
    console.error("Erro no serviço Gemini:", error);
    return `O treinamento de segurança na baleeira ${lifeboat} foi concluído com sucesso, contando com a participação dos ${crewCount} tripulantes embarcados e tempo total de ${duration}.`;
  }
}