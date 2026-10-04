/**
 * Data contract representing a Post from the external JSONPlaceholder API.
 */
export interface JsonPlaceholderPost {
  id: number;
  userId: number;
  title: string;
  body: string;
}

/**
 * Data contract representing a User from the external JSONPlaceholder API.
 */
export interface JsonPlaceholderUser {
  id: number;
  name: string;
  username: string;
  email: string;
}
