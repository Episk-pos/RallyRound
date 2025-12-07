declare module '@gooddollar/gun-pk-auth' {
  export interface SEAPair {
    pub: string;
    priv: string;
    epub: string;
    epriv: string;
  }

  export function genDeterministicKeyPair(seed: string): any;
  export function genDeterministicSEAPair(seed: string): SEAPair;
  export function gunAuth(gun: any, seed: string): Promise<any>;
}
