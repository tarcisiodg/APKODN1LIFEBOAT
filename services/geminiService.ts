
import { GoogleGenAI } from "@google/genai";

export async function generateTrainingSummary(lifeboat: string, crewCount: number, duration: string) {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{
        parts: [{
          text: `Gere um resumo executivo offshore formal (em português) para o seguinte cenário de auditoria de segurança:
          Unidade/Baleeira: ${lifeboat}
          Tripulantes Lidos com Sucesso: ${crewCount}
          Tempo de Resposta Total: ${duration}
          
          O resumo deve ser técnico, enfatizando a prontidão da tripulação e a eficácia do sistema de monitoramento Lifesafe ODN1.
          
          REGRAS: Retorne apenas o parágrafo preenchido, sem negritos, sem introduções e sem formatação markdown.`
        }]
      }]
    });

    return response.text?.trim() || `O treinamento de segurança na unidade ${lifeboat} foi concluído com sucesso. Foram registrados ${crewCount} tripulantes lidos via RFID em um tempo total de resposta de ${duration}, demonstrando plena prontidão operacional.`;
  } catch (error) {
    console.error("Erro no serviço Gemini:", error);
    return `O treinamento de segurança na unidade ${lifeboat} foi concluído com sucesso. Foram registrados ${crewCount} tripulantes lidos via RFID em um tempo total de resposta de ${duration}, demonstrando plena prontidão operacional.`;
  }
}
