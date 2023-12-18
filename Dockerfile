FROM denoland/deno:bin-1.39.0 AS deno
FROM swiftlang/swift:nightly-5.6-focal

WORKDIR /app

RUN echo 'int isatty(int fd) { return 1; }' | \
  clang -O2 -fpic -shared -ldl -o faketty.so -xc -
RUN strip faketty.so && chmod 400 faketty.so

COPY --from=deno /deno /usr/local/bin/deno

COPY deps.ts .
RUN deno cache deps.ts

ADD . .
RUN deno cache main.ts

EXPOSE 8000
CMD ["deno", "run", "--allow-net", "--allow-run", "main.ts"]
