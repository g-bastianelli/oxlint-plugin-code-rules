import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { it } from "node:test";
import { fixture, packageRoot, writeFiles } from "./fixtures.js";

it(
  "refreshes editor diagnostics after buffer edits and a new saved consumer",
  { timeout: 15_000 },
  async (t) => {
    const leaf = "export function Child() { return <span/>; }";
    const parent = 'import { Child } from "./Child"; export function Parent() { return <Child/>; }';
    const project = fixture({ "Parent.tsx": parent, "Child.tsx": leaf });
    fs.copyFileSync(
      path.join(project.directory, "custom.json"),
      path.join(project.directory, ".oxlintrc.json"),
    );
    const server = spawn(path.join(packageRoot, "node_modules/.bin/oxlint"), ["--lsp"], {
      cwd: project.directory,
    });
    const messages = [];
    const waiting = [];
    let buffer = Buffer.alloc(0);
    let stderr = "";
    t.after(async () => {
      if (server.exitCode === null && server.signalCode === null) {
        const stopped = once(server, "exit");
        server.kill();
        await stopped;
      }
      project.cleanup();
    });
    server.stderr.on("data", (data) => {
      stderr += data;
    });
    server.stdout.on("data", (data) => {
      buffer = Buffer.concat([buffer, data]);
      while (true) {
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd < 0) break;
        const match = /Content-Length: (\d+)/i.exec(buffer.subarray(0, headerEnd).toString());
        assert.ok(match);
        const length = Number(match[1]);
        assert.ok(Number.isSafeInteger(length));
        if (buffer.length < headerEnd + 4 + length) break;
        const message = JSON.parse(
          buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString(),
        );
        buffer = buffer.subarray(headerEnd + 4 + length);
        if (message.id !== undefined && message.method) {
          send({
            id: message.id,
            result:
              message.method === "workspace/configuration"
                ? message.params.items.map(() => ({}))
                : null,
          });
        }
        const index = waiting.findIndex((item) => item.predicate(message));
        if (index < 0) messages.push(message);
        else waiting.splice(index, 1)[0].resolve(message);
      }
    });

    function send(message) {
      const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...message }));
      server.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
      server.stdin.write(body);
    }

    function receive(predicate) {
      const index = messages.findIndex(predicate);
      if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(`LSP response timed out: ${stderr}`)),
          10_000,
        );
        t.after(() => clearTimeout(timeout));
        waiting.push({
          predicate,
          resolve(message) {
            clearTimeout(timeout);
            resolve(message);
          },
        });
      });
    }

    const uri = pathToFileURL(path.join(project.root, "Child.tsx")).href;
    send({
      id: 1,
      method: "initialize",
      params: {
        processId: null,
        rootUri: pathToFileURL(project.directory).href,
        workspaceFolders: [{ uri: pathToFileURL(project.directory).href, name: "fixture" }],
        capabilities: {
          workspace: { configuration: true },
          textDocument: { publishDiagnostics: { versionSupport: true } },
        },
      },
    });
    assert.equal((await receive((message) => message.id === 1)).result.serverInfo.name, "oxlint");
    send({ method: "initialized", params: {} });
    send({
      method: "textDocument/didOpen",
      params: { textDocument: { uri, languageId: "typescriptreact", version: 1, text: leaf } },
    });
    const first = await receive(isDiagnostics);
    assert.equal(first.params.diagnostics.length, 1);
    assert.match(first.params.diagnostics[0].message, /under Parent\//);
    for (const [version, text, expected] of [
      [2, "export const Child = 1;", 0],
      [3, leaf, 1],
      [4, `${leaf}\n`, 0],
    ]) {
      if (version === 4) writeFiles(project.root, { "Other.tsx": parent });
      send({
        method: "textDocument/didChange",
        params: { textDocument: { uri, version }, contentChanges: [{ text }] },
      });
      assert.equal((await receive(isDiagnostics)).params.diagnostics.length, expected);
    }

    function isDiagnostics(message) {
      return message.method === "textDocument/publishDiagnostics" && message.params.uri === uri;
    }
  },
);
