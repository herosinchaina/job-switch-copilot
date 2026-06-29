export interface AiProvider {
  complete(o: { system: string; prompt: string }): Promise<string>
  stream(o: { system: string; prompt: string }): AsyncIterable<string>
}
