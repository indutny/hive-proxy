export interface ISSHKeyResponse {
  readonly id: number;
  readonly fingerprint: string;
  readonly public_key: string;
  readonly name: string;
}

export interface ISSHKeysResponse {
  readonly ssh_keys: ReadonlyArray<ISSHKeyResponse>;
}

export interface IDropletNetworkAddress {
  readonly ip_address: string;
  readonly type: string;
}

export interface IDropletNetworks {
  readonly v4?: ReadonlyArray<IDropletNetworkAddress>;
  readonly v6?: ReadonlyArray<IDropletNetworkAddress>;
}

export interface IDropletResponse {
  readonly id: number;
  readonly name: string;
  readonly status: 'new' | 'active' | 'off' | 'archive';
  readonly created_at: number;
  readonly networks: IDropletNetworks;
}

export interface ICreateDropletsResponse {
  readonly droplets: ReadonlyArray<IDropletResponse>;
}

export interface IRetrieveDropletResponse {
  readonly droplet: IDropletResponse;
}

export interface IImageResponse {
  readonly id: number;
  readonly name: string;
  readonly slug: string | null;
}

export interface IImagesResponse {
  readonly images: ReadonlyArray<IImageResponse>;
}
