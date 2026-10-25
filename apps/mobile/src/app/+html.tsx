import { ScrollViewStyleReset } from "expo-router/html";
import { type PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <title>Wishing Well</title>
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: "html, body, #root { height: 100%; background-color: #F3EDE2; }",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
