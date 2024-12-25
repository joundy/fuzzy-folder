import * as vscode from "vscode";
import { spawn } from "child_process";
import { Readable } from "stream";

// TODO:
// - prevent injection of shell commands
// - properly handle spawn errors

const BASE_DIR = "/home/neo";
const FD_BIN = "/usr/bin/fd";
const FZF_BIN = "/usr/bin/fzf";
const EXCLUDE_DIRS = [
  "node_modules",
  ".git",
  ".cache",
  "dist",
  "target",
  "android-studio",
  "Android",
];

async function fdFindFolders(): Promise<Buffer> {
  let buffers: Buffer[] = [];

  const fd = spawn(FD_BIN, [
    `--base-directory=${BASE_DIR}`,
    "--type=d",
    ...EXCLUDE_DIRS.map((d) => `--exclude=${d}`),
  ]);

  return new Promise((resolve, reject) => {
    fd.stdout.on("data", (data: Buffer) => {
      buffers.push(data);
    });

    fd.stderr.on("data", (data: Buffer) => {
      reject(new Error(data.toString("utf8")));
    });

    fd.on("error", (error) => {
      reject(error);
    });

    fd.on("close", () => {
      resolve(Buffer.concat(buffers));
    });
  });
}

async function fuzzyFolders(fdBuffer: Buffer, filter: string): Promise<Buffer> {
  let buffers: Buffer[] = [];

  const readable = Readable.from(fdBuffer);
  const fuzzy = spawn(FZF_BIN, [`--filter=${filter}`]);
  readable.pipe(fuzzy.stdin);

  return new Promise((resolve, reject) => {
    fuzzy.stdout.on("data", (data: Buffer) => {
      buffers.push(data);
    });

    fuzzy.stderr.on("data", (data: Buffer) => {
      reject(new Error(data.toString("utf8")));
    });

    fuzzy.on("error", (error) => {
      reject(error);
    });

    fuzzy.on("close", () => {
      resolve(Buffer.concat(buffers));
    });
  });
}

// this function is to limit the buffer reading, the buffer could be very large
function bufferToStrList(
  buffer: Buffer,
  maxItems = 10,
  maxSize = 10_000, // 10kb
): string[] {
  const strList = buffer.subarray(0, maxSize).toString("utf-8").split("\n");
  return strList.splice(0, maxItems);
}

export function activate(context: vscode.ExtensionContext) {
  console.log("fuzzy-folder is now active!");

  const commandDisposable = vscode.commands.registerCommand(
    "fuzzy-folder.quick-open",
    async () => {
      const fdBuffer = await fdFindFolders();
      const fdList = bufferToStrList(fdBuffer);

      const quickPicks = vscode.window.createQuickPick();

      // Disable default filtering
      quickPicks.matchOnDescription = false;
      quickPicks.matchOnDetail = false;
      quickPicks.keepScrollPosition = true;
      quickPicks.items = fdList.map((item) => ({ label: item }));

      quickPicks.onDidChangeValue(async (value) => {
        const folders = await fuzzyFolders(fdBuffer, value);
        const list = bufferToStrList(folders).map((item) => item);
        console.log(list);
        quickPicks.items = list.map((item) => ({ label: item }));
      });

      quickPicks.onDidAccept(() => {
        const acceptedItem = quickPicks.activeItems[0];
        console.log({ acceptedItem });
      });

      quickPicks.show();
    },
  );

  context.subscriptions.push(commandDisposable);
}

export function deactivate() { }
