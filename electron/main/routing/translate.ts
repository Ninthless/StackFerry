import {
  encodeSseEvent,
  translate,
  type OpenAiChatResponse,
  type ResponsesRequest,
  type ResponsesStreamEvent,
} from '@codeproxy/core'

export type ChatTranslation = {
  body: Buffer
  stream: boolean
  model: string
}

export function translateResponsesRequest(body: Buffer): ChatTranslation {
  const parsed = JSON.parse(body.toString('utf8')) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SyntaxError('invalid responses body')
  }
  const source = parsed as ResponsesRequest
  const { request } = translate.openai.translateRequest(source)
  const stream = source.stream === true
  request.stream = stream
  if (stream) {
    request.stream_options = { include_usage: true }
  }
  return {
    body: Buffer.from(JSON.stringify(request)),
    stream,
    model: typeof request.model === 'string' ? request.model : '',
  }
}

export async function translateChatResponse(
  response: Response,
  translation: Pick<ChatTranslation, 'stream' | 'model'>,
): Promise<Response> {
  if (translation.stream) {
    const body = response.body
    if (!body) {
      return new Response(null, {
        status: response.status,
        headers: { 'content-type': 'text/event-stream' },
      })
    }
    const events = translate.openai.translateStream(body, { model: translation.model })
    return new Response(encodeResponsesSse(events), {
      status: response.status,
      headers: { 'content-type': 'text/event-stream' },
    })
  }
  const json = (await response.json()) as OpenAiChatResponse
  const translated = translate.openai.translateResponse(json, { model: translation.model })
  return new Response(JSON.stringify(translated), {
    status: response.status,
    headers: { 'content-type': 'application/json' },
  })
}

function encodeResponsesSse(
  events: AsyncGenerator<ResponsesStreamEvent, void, void>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await events.next()
        if (done) {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
          return
        }
        controller.enqueue(encoder.encode(encodeSseEvent(value.type, value)))
      } catch (error) {
        controller.error(error)
      }
    },
    async cancel() {
      try {
        await events.return?.(undefined)
      } catch {
        return
      }
    },
  })
}
