export type TextFile = {
    filepath: string,
    text: string
}

export type TextFileToken = TextFile & {
    token: Uint32Array;
  };