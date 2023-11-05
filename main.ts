import { mergeReadableStreams, router, serveFile } from "./deps.ts";

Deno.serve({
  port: 8000,
  handler: router({
    "/": (req) => serveFile(req, "./dist/index.html"),
    "/health{z}?{/}?": async () => {
      const version = await swiftVersion();
      return responseJSON({ status: "pass", version });
    },
    "/runner/:version/run{/}?": async (req) => {
      if (req.method !== "POST") {
        return resposeError("Bad request", 400);
      }
      if (!req.body) {
        return resposeError("Bad request", 400);
      }

      const parameters: RequestParameters = await req.json();
      if (!parameters.code) {
        return resposeError("Bad request", 400);
      }

      if (!parameters._streaming) {
        return runOutput(parameters);
      }
      return runStream(parameters);
    },
  }),
});

async function swiftVersion(): Promise<string> {
  const command = makeVersionCommand();
  const { stdout } = await command.output();
  return new TextDecoder().decode(stdout);
}

async function runOutput(
  parameters: RequestParameters,
): Promise<Response> {
  const version = await swiftVersion();

  const { stdout, stderr } = await makeSwiftCommand(parameters).output();
  const output = new TextDecoder().decode(stdout);
  const errors = new TextDecoder().decode(stderr);

  return responseJSON(
    new OutputResponse(
      output,
      errors,
      version,
    ),
  );
}

function runStream(
  parameters: RequestParameters,
): Response {
  return new Response(
    mergeReadableStreams(
      spawn(makeVersionCommand(), "version", "version"),
      spawn(makeSwiftCommand(parameters), "stdout", "stderr"),
    ),
    {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "access-control-allow-origin": "*",
      },
    },
  );
}

function spawn(
  command: Deno.Command,
  stdoutKey: string,
  stderrKey: string,
): ReadableStream<Uint8Array> {
  const process = command.spawn();
  return mergeReadableStreams(
    makeStreamResponse(process.stdout, stdoutKey),
    makeStreamResponse(process.stderr, stderrKey),
  );
}

function makeVersionCommand(): Deno.Command {
  return new Deno.Command(
    "swift",
    { args: ["-version"], stdout: "piped", stderr: "piped" },
  );
}

function makeSwiftCommand(parameters: RequestParameters): Deno.Command {
  const options = parameters.options || "";
  const timeout = parameters.timeout || 30;
  const color = parameters._color || false;
  const env = color
    ? {
      "TERM": "xterm-256color",
      "LD_PRELOAD": "./faketty.so",
    }
    : undefined;

  return new Deno.Command(
    "sh",
    {
      args: [
        "-c",
        `echo '${parameters.code}' | timeout ${timeout} swift ${options} -`,
      ],
      env,
      stdout: "piped",
      stderr: "piped",
    },
  );
}

function makeStreamResponse(
  stream: ReadableStream<Uint8Array>,
  key: string,
): ReadableStream<Uint8Array> {
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        controller.enqueue(
          new TextEncoder().encode(
            `${JSON.stringify(new StreamResponse(key, text))}\n`,
          ),
        );
      },
    }),
  );
}

function responseJSON(json: unknown): Response {
  return new Response(
    JSON.stringify(json),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
    },
  );
}

function resposeError(message: string, status: number): Response {
  return new Response(message, { status });
}

interface RequestParameters {
  command?: string;
  options?: string;
  code?: string;
  timeout?: number;
  _color?: boolean;
  _streaming?: boolean;
}

class OutputResponse {
  output: string;
  errors: string;
  version: string;

  constructor(output: string, errors: string, version: string) {
    this.output = output;
    this.errors = errors;
    this.version = version;
  }
}

class StreamResponse {
  kind: string;
  text: string;

  constructor(kind: string, text: string) {
    this.kind = kind;
    this.text = text;
  }
}
