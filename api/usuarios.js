const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jhdwssnwtbgyfslnmwxa.supabase.co';
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_28l6sNMFCYxoDxEItm1QbA_B-0JkUXm';

function usernameIdentifier(name) {
  return name.normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[^a-z0-9]/g,'');
}

module.exports = async function handler(req,res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'Método não permitido.' });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(500).json({ error:'Configure SUPABASE_SERVICE_ROLE_KEY na Vercel.' });

  const authorization = req.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) return res.status(401).json({ error:'Administrador não autenticado.' });

  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`,{
    headers:{ apikey:PUBLISHABLE_KEY,Authorization:authorization }
  });
  if (!userResponse.ok) return res.status(401).json({ error:'Sessão administrativa inválida.' });

  const nome = String(req.body?.nome || '').trim().replace(/\s+/g,' ');
  const senha = String(req.body?.senha || '');
  if (!/^[\p{L}\p{N}]+(?: [\p{L}\p{N}]+)*$/u.test(nome)) {
    return res.status(400).json({ error:'Use somente letras, números e espaços no nome.' });
  }
  if (senha.length < 6) return res.status(400).json({ error:'A senha precisa ter no mínimo 6 caracteres.' });

  const identifier = usernameIdentifier(nome);
  const email = `${identifier}@portal-recebimento.com`;
  const createResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`,{
    method:'POST',
    headers:{
      apikey:serviceKey,
      Authorization:`Bearer ${serviceKey}`,
      'Content-Type':'application/json'
    },
    body:JSON.stringify({
      email,
      password:senha,
      email_confirm:true,
      user_metadata:{ nome,usuario:nome }
    })
  });
  const result = await createResponse.json();
  if (!createResponse.ok) {
    const duplicate = /already|registered|exists/i.test(result.message || '');
    return res.status(duplicate ? 409 : 400).json({
      error:duplicate ? 'Esse nome de usuário já está cadastrado.' : (result.message || 'Erro ao criar usuário.')
    });
  }
  return res.status(201).json({ usuario:{ id:result.id,nome,email } });
};
