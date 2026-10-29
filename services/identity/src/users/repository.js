import { randomUUID } from 'node:crypto';

const publicColumns = 'id, name, email, role, created_at AS "createdAt", updated_at AS "updatedAt"';

export function createUserRepository(pool) {
  return {
    async create({ name, email, passwordHash }) {
      const { rows } = await pool.query(
        `INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING ${publicColumns}`,
        [randomUUID(), name, email, passwordHash],
      );
      return rows[0];
    },
    async findCredentials(email) {
      const { rows } = await pool.query(
        `SELECT ${publicColumns}, password_hash AS "passwordHash" FROM users WHERE email = $1`, [email],
      );
      return rows[0];
    },
    async findById(id) {
      return (await pool.query(`SELECT ${publicColumns} FROM users WHERE id = $1`, [id])).rows[0];
    },
    async updateName(id, name) {
      return (await pool.query(
        `UPDATE users SET name = $2, updated_at = now() WHERE id = $1 RETURNING ${publicColumns}`,
        [id, name],
      )).rows[0];
    },
  };
}

