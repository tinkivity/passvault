export interface ChallengeResponse {
  nonce: string;
  difficulty: number;
  timestamp: number;
  ttl: number;
}

export interface PowHeaders {
  'x-pow-solution': string;
  'x-pow-nonce': string;
  'x-pow-timestamp': string;
}
