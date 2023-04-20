FROM swiftlang/swift:nightly-5.6-focal

# Install Deno
RUN apt-get -qq update \
  && apt-get -qq -y install curl zip unzip \
  && curl -fsSL https://deno.land/x/install/install.sh | sh \
  && apt-get -qq remove curl zip unzip \
  && apt-get -qq remove --purge -y curl zip unzip \
  && apt-get -qq -y autoremove \
  && apt-get -qq clean

WORKDIR /app

ENV PATH "/root/.deno/bin:$PATH"

COPY deps.ts .
RUN deno cache --reload --unstable deps.ts

ADD . .
RUN deno cache --reload --unstable main.ts

EXPOSE 8000
CMD ["deno", "run", "--allow-env", "--allow-net", "--allow-run", "main.ts"]
