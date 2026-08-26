declare module 'sql.js' {
  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
  }

  export interface Database {
    run(sql: string, params?: unknown[]): void;
    exec(sql: string, params?: unknown[]): QueryExecResult[];
    export(): Uint8Array;
    close(): void;
    prepare(sql: string): Statement;
  }

  export interface Statement {
    bind(params?: unknown[]): void;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    run(params?: unknown[]): void;
    free(): void;
  }

  export interface QueryExecResult {
    columns: string[];
    values: unknown[][];
  }

  export type InitSqlJsConfig = {
    locateFile?: (file: string) => string;
  };

  export default function initSqlJs(config?: InitSqlJsConfig): Promise<SqlJsStatic>;
}
