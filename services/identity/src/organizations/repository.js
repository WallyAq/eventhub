import { randomUUID } from 'node:crypto';

const columns = 'o.id, o.name, o.description, o.cnpj,o.legal_name AS "legalName",o.entity_type AS "entityType",o.phone,o.email, o.created_at AS "createdAt", o.updated_at AS "updatedAt", m.role AS "membershipRole"';

export function createOrganizationRepository(pool) {
  return {
    async create(userId, { name, description }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const id = randomUUID();
        const { rows } = await client.query(
          'INSERT INTO organizations (id,name,description) VALUES ($1,$2,$3) RETURNING id,name,description,created_at AS "createdAt",updated_at AS "updatedAt"',
          [id, name, description],
        );
        await client.query("INSERT INTO organization_members (organization_id,user_id,role) VALUES ($1,$2,'OWNER')", [id, userId]);
        await client.query('COMMIT');
        return { ...rows[0], membershipRole: 'OWNER' };
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async list(userId) {
      return (await pool.query(`SELECT ${columns} FROM organizations o JOIN organization_members m ON m.organization_id=o.id WHERE m.user_id=$1 ORDER BY o.created_at,o.id`, [userId])).rows;
    },
    async findForUser(id, userId) {
      return (await pool.query(`SELECT ${columns} FROM organizations o JOIN organization_members m ON m.organization_id=o.id WHERE o.id=$1 AND m.user_id=$2`, [id, userId])).rows[0];
    },
    async update(id, userId, { name, description, cnpj, legalName, entityType, phone, email }) {
      return (await pool.query(`UPDATE organizations o SET name=COALESCE($3,o.name),description=COALESCE($4,o.description),
        cnpj=COALESCE($5,o.cnpj),legal_name=COALESCE($6,o.legal_name),entity_type=COALESCE($7,o.entity_type),phone=COALESCE($8,o.phone),email=COALESCE($9,o.email),updated_at=now()
        FROM organization_members m WHERE o.id=$1 AND m.organization_id=o.id AND m.user_id=$2 AND m.role='OWNER'
        RETURNING ${columns}`, [id, userId, name ?? null, description ?? null, cnpj ?? null, legalName ?? null, entityType ?? null, phone ?? null, email ?? null])).rows[0];
    },
    async members(id, userId) {
      return (await pool.query(`SELECT u.id,u.name,u.email,m.role,m.created_at AS "createdAt" FROM organization_members m JOIN users u ON u.id=m.user_id
        WHERE m.organization_id=$1 AND EXISTS(SELECT 1 FROM organization_members actor WHERE actor.organization_id=$1 AND actor.user_id=$2)
        ORDER BY m.created_at,u.id`, [id, userId])).rows;
    },
    async addMember(id, userId, email) {
      const { rows } = await pool.query(`INSERT INTO organization_members (organization_id,user_id,role)
        SELECT $1,u.id,'ORGANIZER' FROM users u WHERE u.email=$3
        AND EXISTS(SELECT 1 FROM organization_members actor WHERE actor.organization_id=$1 AND actor.user_id=$2 AND actor.role='OWNER')
        RETURNING user_id AS id,role,created_at AS "createdAt"`, [id, userId, email]);
      return rows[0];
    },
  };
}
