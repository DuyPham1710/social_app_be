export interface DeezerArtist {
    id: number;
    name: string;
    picture: string;
}

export interface DeezerAlbum {
    id: number;
    title: string;
    cover: string;
}

export interface DeezerMusic {
    id: number;
    title: string;
    preview: string; // link 30s preview    
    artist: DeezerArtist;
    album: DeezerAlbum;
}
