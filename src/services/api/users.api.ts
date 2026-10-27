import { request } from "./client"
import type { User } from "../../types/user"

export const usersApi = {
  getProfile: () => request<User | undefined>("/users/me"),
  updateProfile: (data: Partial<User>) =>
    request<User>("/users/me", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
}
