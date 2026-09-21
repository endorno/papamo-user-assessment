// seeds/*.sql をテストからそのまま読み込むための宣言。
declare module '*.sql?raw' {
  const content: string;
  export default content;
}
