export type TextFile = {
    filepath: string,
    text: string
}

export type TextFileWithToken = TextFile & {
    token: Uint32Array;
  };