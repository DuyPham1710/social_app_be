export interface HuggingFaceZeroShotResponse {
  sequence: string;
  labels: string[];
  scores: number[];
}

export interface HuggingFaceZeroShotLabelScore {
  label: string;
  score: number;
}
