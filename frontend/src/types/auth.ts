export type User = {
  id: string; name: string; email: string; role: 'PARTICIPANT'; createdAt: string; updatedAt: string;
  cpf?: string | null; phone?: string | null; marketingOptIn?: boolean;
};
export type LoginResult = { accessToken: string; tokenType: 'Bearer'; expiresIn: number; user: User };

