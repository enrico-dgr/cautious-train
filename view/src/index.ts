import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';

import { Executable, runProgram } from './logic';

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "./preload"),
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    },
  });

  win.loadFile(path.join(__dirname, "./index.html"));
}

/**
 *
 */
app.whenReady().then(() => {
  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
/**
 *
 */
app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});
// --------------------------------
// Channels
// --------------------------------
/**
 * needed types
 */
type Either<E, A> = { _tag: "Left"; left: E } | { _tag: "Right"; right: A };
/**
 * utils
 */
const array_unique = <A>(user: A, index: number, arr: A[]) =>
  arr.indexOf(user) === index;
//
const match = <A, B>(onRight: (a: A) => B, onLeft: (e: Error) => B) => (
  safeItem: Either<Error, A>
) =>
  safeItem._tag === "Right" ? onRight(safeItem.right) : onLeft(safeItem.left);
//
const fromSafeDB = (safeItem: Either<Error, Executable.Deps[]>) =>
  match<Executable.Deps[], Executable.Deps[]>(
    (a) => a,
    (_e) => []
  )(safeItem);

//
const mapSafe = <A>(
  safeItem: Either<Error, Executable.Deps[]>,
  select: (db: Executable.Deps) => A
) => (safeItem._tag === "Right" ? safeItem.right.map(select) : []);
/**
 * Get Queries
 */
ipcMain.on("getQueries", (event, _args) => {
  /**
   * Get DB of Settings
   */
  const safeDB = Executable.getJson();
  /**
   * Get Programs
   */
  let programs = Object.keys(Executable.EnumNamesOfPrograms);
  programs = programs.slice(
    programs.length % 2 === 0
      ? programs.length * 0.5
      : Math.round(programs.length * 0.5) - 1
  );
  /**
   * Get Users
   */
  let users = mapSafe<string>(safeDB, (deps) =>
    !!deps.user ? deps.user : "None"
  );

  users = users.filter(array_unique);
  /**
   * Return
   */
  const res: { users: string[]; programs: string[] } = {
    users,
    programs,
  };
  event.returnValue = res;
});
/**
 * Get Settings
 */
ipcMain.on("getSettings", (event, ...args) => {
  /**
   * Get DB of Settings
   */
  const safeDB = Executable.getJson();
  /**
   * Get Queries
   */

  const queries = args[0];
  const { program, user } = queries ?? { user: "unknown", program: "unknown" };
  /**
   * Query Settings
   */
  const settings = fromSafeDB(safeDB).find(
    ({ nameOfProgram, user: thisUser }) =>
      nameOfProgram === program && thisUser === user
  );
  /**
   * Return
   */
  const res =
    settings !== undefined
      ? {
          programOptions: settings.programOptions,
          launchOptions: settings.launchOptions,
        }
      : {};
  event.returnValue = res;
});
/**
 * Post Settings
 */
ipcMain.handle("postSettings", async (_event, ...args) => {
  /**
   * Get DB of Settings
   */
  const safeDB = Executable.getJson();
  /**
   * Get Queries
   */
  const queries = args[0];

  const { nameOfProgram, user }: Executable.Queries = queries;

  /**
   * Get New Settings
   */
  const newSettings = args[1] as Executable.Settings;
  /**
   * Query Settings
   */
  const indexOfSettings = fromSafeDB(safeDB).findIndex(
    ({ nameOfProgram, user: thisUser }) =>
      nameOfProgram === nameOfProgram && thisUser === user
  );
  /**
   * Post
   */
  // default res
  type Response = {
    status: number;
    statusText?: string;
  };
  let res: Response = {
    status: 500,
    statusText: "No action by the server.",
  };

  /**
   * Return
   */
  if (indexOfSettings < 0) {
    res = {
      status: 400,
      statusText: "User has not settings for this program.",
    };
  } else if (nameOfProgram === null || user === null) {
    res = {
      status: 400,
      statusText: "Queries must have values.",
    };
  } else if (
    newSettings === undefined ||
    typeof newSettings !== typeof fromSafeDB(safeDB)[indexOfSettings]
  ) {
    res = {
      status: 400,
      statusText: "New settings don't match type of previous ones.",
    };
  } else {
    const post = await Executable.modifyDepsOnJsonFile(
      nameOfProgram,
      user
    )({
      nameOfProgram,
      user,
      ...newSettings,
    } as Executable.Deps)();
    res = match<
      void,
      {
        status: number;
        statusText: string | undefined;
      }
    >(
      () => ({
        status: 200,
        statusText: undefined,
      }),
      (e) => ({
        status: 500,
        statusText: e.message,
      })
    )(post);
  }

  return res;
});
/**
 * Run Program
 */
ipcMain.handle("runProgram", async (_event, ...args) => {
  /**
   * Get Queries
   */
  const queries = args[0];

  const { nameOfProgram, user }: Executable.Queries = queries;

  /**
   * Run Program && Return
   */
  // default res
  type Response = {
    status: number;
    statusText?: string;
  };
  let res: Response = {
    status: 500,
    statusText: "No action by the server.",
  };

  if (nameOfProgram === null || user === null) {
    res = {
      status: 400,
      statusText: "Queries must have values.",
    };
  } else {
    const err = await runProgram(nameOfProgram, user).catch((err) =>
      JSON.stringify(err)
    );
    typeof err !== "string"
      ? (res = {
          status: 200,
          statusText: undefined,
        })
      : (res = {
          status: 400,
          statusText: err,
        });
  }
  return res;
});