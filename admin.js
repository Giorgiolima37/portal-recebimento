const body = document.querySelector('#records-body');
const emptyState = document.querySelector('#empty-state');
const emptyTitle = emptyState.querySelector('strong');
const emptyText = emptyState.querySelector('span');
const search = document.querySelector('#search');
const modal = document.querySelector('#driver-modal');
const modalClose = document.querySelector('#modal-close');
const serviceModal = document.querySelector('#service-modal');
const cancelServiceButton = document.querySelector('#cancel-service');
const confirmServiceButton = document.querySelector('#confirm-service');
const shiftModal = document.querySelector('#shift-modal');
const endShiftButton = document.querySelector('#end-shift');
const cancelShiftButton = document.querySelector('#cancel-shift');
const confirmShiftButton = document.querySelector('#confirm-shift');
const config = window.SUPABASE_CONFIG;
const supabaseClient = window.supabase.createClient(config.url, config.publishableKey);
const loginScreen = document.querySelector('#login-screen');
const adminPanel = document.querySelector('#admin-panel');
const loginForm = document.querySelector('#login-form');
const loginButton = document.querySelector('#login-button');
const loginError = document.querySelector('#login-error');
const logoutButton = document.querySelector('#logout-button');
const passwordModal = document.querySelector('#password-modal');
const passwordForm = document.querySelector('#password-form');
const passwordFeedback = document.querySelector('#password-feedback');
let records = [];
let pendingServiceRecord = null;
let pendingTargetStatus = null;
let loadingRecords = false;
let refreshTimer = null;

function usernameToEmail(username) {
  const identifier = (username || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]/g,'');
  return identifier ? `${identifier}@portal-recebimento.com` : '';
}

async function showAuthenticatedPanel(session) {
  const authenticated = Boolean(session);
  loginScreen.hidden = authenticated;
  adminPanel.hidden = !authenticated;
  if (authenticated) {
    await loadRecords();
    if (!refreshTimer) refreshTimer = setInterval(() => loadRecords(false),3000);
  } else if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

loginForm.addEventListener('submit',async (event) => {
  event.preventDefault();
  loginError.textContent = '';
  loginButton.disabled = true;
  loginButton.textContent = 'ENTRANDO...';
  const email = usernameToEmail(document.querySelector('#login-email').value);
  const password = document.querySelector('#login-password').value;
  const { error } = await supabaseClient.auth.signInWithPassword({ email,password });
  loginButton.disabled = false;
  loginButton.textContent = 'ENTRAR';
  if (error) loginError.textContent = 'E-mail ou senha incorretos.';
});

logoutButton.addEventListener('click',async () => {
  await supabaseClient.auth.signOut();
});

function openPrivateSettings() {
  passwordModal.hidden = false;
  document.querySelector('#new-user-form').reset();
  document.querySelector('#new-user-name').value = '';
  document.querySelector('#new-user-password').value = '';
  document.querySelector('#new-user-confirm').value = '';
  passwordFeedback.textContent = '';
  passwordFeedback.classList.remove('success');
  document.body.classList.add('modal-open');
}

document.querySelector('#private-settings').addEventListener('click',openPrivateSettings);
document.querySelector('#private-settings-panel').addEventListener('click',openPrivateSettings);

function closePasswordModal() {
  passwordModal.hidden = true;
  passwordForm.reset();
  document.body.classList.remove('modal-open');
}

document.querySelector('#password-close').addEventListener('click',closePasswordModal);
passwordModal.addEventListener('click',(event) => { if (event.target === passwordModal) closePasswordModal(); });

passwordForm.addEventListener('submit',async (event) => {
  event.preventDefault();
  const currentPassword = document.querySelector('#current-password').value;
  const newPassword = document.querySelector('#new-password').value;
  const confirmation = document.querySelector('#confirm-password').value;
  const email = usernameToEmail(document.querySelector('#password-user').value);
  passwordFeedback.classList.remove('success');
  if (newPassword !== confirmation) {
    passwordFeedback.textContent = 'As novas senhas não são iguais.';
    return;
  }
  const { error:loginError } = await supabaseClient.auth.signInWithPassword({ email,password:currentPassword });
  if (loginError) {
    passwordFeedback.textContent = 'A senha atual está incorreta.';
    return;
  }
  const { error } = await supabaseClient.auth.updateUser({ password:newPassword });
  if (error) {
    passwordFeedback.textContent = 'Não foi possível alterar a senha.';
    return;
  }
  passwordFeedback.textContent = 'Senha alterada com sucesso.';
  passwordFeedback.classList.add('success');
  passwordForm.reset();
  await supabaseClient.auth.signOut();
});

document.querySelector('#new-user-form').addEventListener('submit',async (event) => {
  event.preventDefault();
  const username = document.querySelector('#new-user-name').value.trim();
  const password = document.querySelector('#new-user-password').value;
  const confirmation = document.querySelector('#new-user-confirm').value;
  const feedback = document.querySelector('#new-user-feedback');
  feedback.classList.remove('success');
  if (!/^[\p{L}\p{N}]+(?: [\p{L}\p{N}]+)*$/u.test(username)) {
    feedback.textContent = 'Use somente nomes, números e espaços simples.';
    return;
  }
  if (password !== confirmation) {
    feedback.textContent = 'As senhas informadas não são iguais.';
    return;
  }
  const { data:{ session } } = await supabaseClient.auth.getSession();
  if (!session) {
    feedback.textContent = 'Entre no painel antes de adicionar um novo usuário.';
    return;
  }
  const button = document.querySelector('#add-user-button');
  button.disabled = true;
  button.textContent = 'ADICIONANDO...';
  try {
    const response = await fetch('/api/usuarios',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${session.access_token}`
      },
      body:JSON.stringify({ nome:username,senha:password })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível adicionar o usuário.');
    feedback.textContent = `Usuário ${result.usuario.nome} adicionado com sucesso.`;
    feedback.classList.add('success');
    const chip = document.createElement('span');
    chip.textContent = result.usuario.nome;
    document.querySelector('.registered-users').appendChild(chip);
    event.target.reset();
  } catch (error) {
    feedback.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'ADICIONAR USUÁRIO';
  }
});

document.querySelector('#new-user-name').addEventListener('input',(event) => {
  const cursor = event.target.selectionStart;
  event.target.value = event.target.value
    .toLocaleLowerCase('pt-BR')
    .replace(/(^|\s)([\p{L}\p{N}])/gu,(_,space,letter) => space + letter.toLocaleUpperCase('pt-BR'));
  event.target.setSelectionRange(cursor,cursor);
});

supabaseClient.auth.onAuthStateChange((_event,session) => {
  setTimeout(() => showAuthenticatedPanel(session),0);
});

function isToday(value) {
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function formatDate(value) {
  return new Intl.DateTimeFormat('pt-BR', {
    day:'2-digit', month:'2-digit', year:'numeric',
    hour:'2-digit', minute:'2-digit'
  }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour:'2-digit', minute:'2-digit'
  }).format(new Date(value));
}

function formatDay(value) {
  return new Intl.DateTimeFormat('pt-BR', {
    day:'2-digit', month:'2-digit', year:'numeric'
  }).format(new Date(value));
}

function updateSummary() {
  const todayRecords = records.filter((record) => isToday(record.criado_em));
  const companiesToday = new Set(todayRecords
    .map((record) => (record.empresa || '').trim().toLocaleLowerCase('pt-BR'))
    .filter(Boolean));
  document.querySelector('#companies-today-count').textContent = companiesToday.size;
  document.querySelector('#waiting-count').textContent = todayRecords.filter((record) => record.status === 'aguardando').length;
  document.querySelector('#service-count').textContent = todayRecords.filter((record) => record.status === 'em_atendimento').length;
  document.querySelector('#today-count').textContent = todayRecords.filter((record) => record.status === 'recebido').length;
}

function render(filter = '') {
  const query = filter.trim().toLocaleLowerCase('pt-BR');
  const filtered = records.filter((record) => [record.empresa,record.motorista,record.celular]
    .join(' ').toLocaleLowerCase('pt-BR').includes(query));
  body.textContent = '';

  filtered.forEach((record) => {
    const item = document.createElement('div');
    item.className = 'company-item';
    if (record.status === 'aguardando') item.classList.add('waiting');
    if (record.status === 'recebido') item.classList.add('received');
    const details = document.createElement('button');
    details.type = 'button';
    details.className = 'company-details';
    const name = document.createElement('strong');
    name.textContent = `${record.empresa || 'Empresa não informada'} - ${formatTime(record.criado_em)}`;
    const arrow = document.createElement('i');
    arrow.textContent = '›';
    arrow.setAttribute('aria-hidden','true');
    const date = document.createElement('span');
    date.textContent = formatDay(record.criado_em);
    details.append(name,date,arrow);
    details.addEventListener('click',() => openDriverModal(record));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'delete-company';
    remove.setAttribute('aria-label',`Excluir check-in de ${record.empresa}`);
    remove.title = 'Excluir check-in';
    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg>';
    remove.addEventListener('click',() => deleteCheckin(record));
    const actions = document.createElement('div');
    actions.className = 'company-actions';
    if (record.status === 'aguardando') {
      const release = document.createElement('button');
      release.type = 'button';
      release.className = 'release-service';
      release.setAttribute('aria-label',`Liberar atendimento de ${record.empresa}`);
      release.title = 'Liberar atendimento';
      release.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
      release.addEventListener('click',() => openServiceModal(record,'em_atendimento'));
      actions.appendChild(release);
    } else if (record.status === 'em_atendimento') {
      const finish = document.createElement('button');
      finish.type = 'button';
      finish.className = 'finish-service';
      finish.setAttribute('aria-label',`Finalizar atendimento de ${record.empresa}`);
      finish.title = 'Finalizar atendimento';
      finish.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
      finish.addEventListener('click',() => openServiceModal(record,'recebido'));
      actions.appendChild(finish);
    }
    actions.appendChild(remove);
    item.append(details,actions);
    body.appendChild(item);
  });

  emptyState.style.display = filtered.length ? 'none' : 'flex';
  if (!filtered.length) {
    emptyTitle.textContent = 'Motoristas em espera';
    emptyText.textContent = query ? 'Nenhum motorista corresponde à busca.' : 'Os novos check-ins aparecerão aqui.';
  }
  updateSummary();
}

function openServiceModal(record,targetStatus) {
  pendingServiceRecord = record;
  pendingTargetStatus = targetStatus;
  document.querySelector('#service-company').textContent = record.empresa;
  const finishing = targetStatus === 'recebido';
  document.querySelector('#service-title').textContent = finishing ? 'Finalizar atendimento?' : 'Liberar atendimento?';
  document.querySelector('#service-modal p').firstChild.textContent = finishing
    ? 'A empresa '
    : 'A empresa ';
  document.querySelector('#service-modal p').lastChild.textContent = finishing
    ? ' sairá de “Em atendimento” e entrará em “Recebidos hoje”.'
    : ' sairá de “Aguardando” e entrará em “Em atendimento”.';
  confirmServiceButton.textContent = finishing ? 'Finalizar' : 'Confirmar';
  serviceModal.hidden = false;
  document.body.classList.add('modal-open');
  confirmServiceButton.focus();
}

function closeServiceModal() {
  serviceModal.hidden = true;
  pendingServiceRecord = null;
  pendingTargetStatus = null;
  document.body.classList.remove('modal-open');
}

async function confirmService() {
  if (!pendingServiceRecord || !pendingTargetStatus) return;
  const currentStatus = pendingServiceRecord.status;
  const targetStatus = pendingTargetStatus;
  confirmServiceButton.disabled = true;
  confirmServiceButton.textContent = 'Atualizando...';
  const request = supabaseClient.from('motoristas')
    .update({ status:targetStatus })
    .eq('id',pendingServiceRecord.id)
    .eq('status',currentStatus)
    .select('id');
  const { data,error } = await request;
  confirmServiceButton.disabled = false;
  confirmServiceButton.textContent = targetStatus === 'recebido' ? 'Finalizar' : 'Confirmar';
  if (error || !data?.length) {
    console.error('Erro ao liberar atendimento:',error);
    window.alert('Não foi possível liberar. Confira a permissão de atualização no Supabase.');
    return;
  }
  localStorage.setItem('portalAtendimentosAtualizados',String(Date.now()));
  closeServiceModal();
  await loadRecords();
}

async function deleteCheckin(record) {
  const confirmed = window.confirm(`Excluir o check-in de ${record.empresa}? Esta ação não pode ser desfeita.`);
  if (!confirmed) return;
  const { data,error } = await supabaseClient
    .from('motoristas')
    .delete()
    .eq('id',record.id)
    .select('id');
  if (error) {
    console.error('Erro ao excluir check-in:',error);
    window.alert('Não foi possível excluir. Confira a permissão no Supabase.');
    return;
  }
  if (!data?.length) {
    window.alert('O Supabase não autorizou a exclusão. Execute a política de exclusão no SQL Editor.');
    return;
  }
  await loadRecords();
}

function openShiftModal() {
  shiftModal.hidden = false;
  document.body.classList.add('modal-open');
  confirmShiftButton.focus();
}

function closeShiftModal() {
  shiftModal.hidden = true;
  document.body.classList.remove('modal-open');
}

async function finishShift() {
  confirmShiftButton.disabled = true;
  confirmShiftButton.textContent = 'Finalizando...';
  const { data,error } = await supabaseClient.from('motoristas')
    .delete()
    .not('id','is',null)
    .select('id');
  confirmShiftButton.disabled = false;
  confirmShiftButton.textContent = 'Finalizar expediente';
  if (error || (records.length > 0 && !data?.length)) {
    console.error('Erro ao finalizar expediente:',error);
    window.alert('Não foi possível finalizar o expediente. Confira a permissão de exclusão no Supabase.');
    return;
  }
  records = [];
  render(search.value);
  localStorage.setItem('portalAtendimentosAtualizados',String(Date.now()));
  closeShiftModal();
}

function openDriverModal(record) {
  document.querySelector('#modal-company').textContent = record.empresa || 'Empresa não informada';
  document.querySelector('#modal-driver').textContent = record.motorista || 'Não informado';
  document.querySelector('#modal-vehicle').textContent = record.tipo_veiculo || 'Não informado';
  const phone = document.querySelector('#modal-phone');
  phone.textContent = record.celular || 'Não informado';
  const phoneDigits = (record.celular || '').replace(/\D/g,'');
  phone.href = phoneDigits ? `tel:${phoneDigits}` : '#';
  modal.hidden = false;
  document.body.classList.add('modal-open');
  modalClose.focus();
}

function closeDriverModal() {
  modal.hidden = true;
  document.body.classList.remove('modal-open');
}

modalClose.addEventListener('click',closeDriverModal);
modal.addEventListener('click',(event) => { if (event.target === modal) closeDriverModal(); });
document.addEventListener('keydown',(event) => { if (event.key === 'Escape' && !modal.hidden) closeDriverModal(); });
cancelServiceButton.addEventListener('click',closeServiceModal);
confirmServiceButton.addEventListener('click',confirmService);
serviceModal.addEventListener('click',(event) => { if (event.target === serviceModal) closeServiceModal(); });
document.addEventListener('keydown',(event) => { if (event.key === 'Escape' && !serviceModal.hidden) closeServiceModal(); });
endShiftButton.addEventListener('click',openShiftModal);
cancelShiftButton.addEventListener('click',closeShiftModal);
confirmShiftButton.addEventListener('click',finishShift);
shiftModal.addEventListener('click',(event) => { if (event.target === shiftModal) closeShiftModal(); });
document.addEventListener('keydown',(event) => { if (event.key === 'Escape' && !shiftModal.hidden) closeShiftModal(); });

async function loadRecords(showLoading = true) {
  if (loadingRecords) return;
  loadingRecords = true;
  if (showLoading) {
    emptyState.style.display = 'flex';
    emptyTitle.textContent = 'Carregando motoristas...';
    emptyText.textContent = 'Aguarde um momento.';
  }
  const startOfToday = new Date();
  startOfToday.setHours(0,0,0,0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const { data,error } = await supabaseClient.from('motoristas')
    .select('id,empresa,motorista,celular,tipo_veiculo,status,criado_em')
    .gte('criado_em',startOfToday.toISOString())
    .lt('criado_em',startOfTomorrow.toISOString())
    .order('criado_em',{ ascending:false });

  if (error) {
    loadingRecords = false;
    console.error('Erro ao carregar motoristas:',error);
    if (showLoading) {
      emptyTitle.textContent = 'Não foi possível carregar os motoristas';
      emptyText.textContent = 'Confira a política de leitura no Supabase e atualize a página.';
    }
    return;
  }
  records = data || [];
  loadingRecords = false;
  render(search.value);
}

search.addEventListener('input',() => render(search.value));
supabaseClient.auth.getSession().then(({ data }) => showAuthenticatedPanel(data.session));
