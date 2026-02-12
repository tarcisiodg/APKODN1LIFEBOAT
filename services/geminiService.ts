
import { GoogleGenAI } from "@google/genai";

export async function generateTrainingSummary(lifeboat: string, crewCount: number, duration: string) {
  try {
    // A chave de API deve ser obtida via process.env.API_KEY conforme as regras do SDK
    const apiKey = process.env.API_KEY;
    
    if (!apiKey) {
      console.warn("API_KEY não configurada no ambiente.");
      return `O treinamento de segurança na baleeira ${lifeboat} foi concluído com sucesso, contando com a participação dos ${crewCount} tripulantes embarcados e tempo total de ${duration}.`;
    }

    const ai = new GoogleGenAI({ apiKey });
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

    return response.text?.trim() || `O treinamento de segurança na baleeira ${lifeboat} foi concluído com sucesso, contando com a participação dos ${crewCount} tripulantes embarcados e tempo total de ${duration}.`;
  } catch (error) {
    console.error("Erro no serviço Gemini:", error);
    return `O treinamento de segurança na baleeira ${lifeboat} foi concluído com sucesso, contando com a participação dos ${crewCount} tripulantes embarcados e tempo total de ${duration}.`;
  }
}
