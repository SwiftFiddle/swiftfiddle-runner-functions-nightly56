import { serveListener } from "./deps.ts";
import { mergeReadableStreams } from "./deps.ts";

async function handler(req: Request): Promise<Response> {
  switch (req.method) {
    case "GET": {
      const url = new URL(req.url);
      switch (url.pathname) {
        case "/": {
          const version = await swiftVersion();
          return responseJSON({ status: "pass", version });
        }
        case "/healthz": {
          const version = await swiftVersion();
          return responseJSON({ status: "pass", version });
        }
      }
      break;
    }
    case "POST": {
      const url = new URL(req.url);
      switch (url.pathname) {
        case "/runner/nightly-5.6/run": {
          if (!req.body) {
            return resposeError("No body", 400);
          }

          const parameters: RequestParameters = await req.json();
          if (!parameters.code) {
            return resposeError("No code", 400);
          }

          if (!parameters._streaming) {
            return runOutput(parameters);
          }

          return runStream(parameters);
        }
      }
      break;
    }
  }

  return resposeError("Not found", 404);
}

async function swiftVersion(): Promise<string> {
  const command = makeVersionCommand();
  return await output(command);
}

async function runOutput(
  parameters: RequestParameters,
): Promise<Response> {
  const version = await swiftVersion();

  const { stdout, stderr } = await makeSwiftCommand(parameters).output();
  const output = new TextDecoder().decode(stdout);
  const errors = new TextDecoder().decode(stderr);

  return responseJSON(
    new RunResponse(
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
      spawn(makeVersionCommand()),
      spawn(makeSwiftCommand(parameters)),
    ),
    {
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    },
  );
}

async function output(command: Deno.Command): Promise<string> {
  const { stdout } = await command.output();
  return new TextDecoder().decode(stdout);
}

function spawn(command: Deno.Command): ReadableStream<Uint8Array> {
  const process = command.spawn();
  return mergeReadableStreams(
    process.stdout,
    process.stderr,
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

function responseJSON(
  json: unknown,
): Response {
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
  return new Response(
    message,
    { status },
  );
}

interface RequestParameters {
  command?: string;
  options?: string;
  code?: string;
  timeout?: number;
  _color?: boolean;
  _streaming?: boolean;
}

class RunResponse {
  output: string;
  errors: string;
  version: string;

  constructor(output: string, errors: string, version: string) {
    this.output = output;
    this.errors = errors;
    this.version = version;
  }
}

const listener = Deno.listen({ port: 8000 });
await serveListener(listener, handler);
