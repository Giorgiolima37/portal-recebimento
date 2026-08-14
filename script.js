const form = document.querySelector('#checkin-form');
const feedback = document.querySelector('#feedback');
const submitButton = form.querySelector('.continue');
const companyInput = form.elements.empresa;
const driverInput = form.elements.motorista;
const vehicleTypeInput = form.elements.tipoVeiculo;
const phoneInput = form.elements.celular;
const ddiInput = form.elements.ddi;
const dddInput = form.elements.ddd;
const noPhoneInput = document.querySelector('#no-phone');
const editCheckinButton = document.querySelector('#edit-checkin');
const homeButton = document.querySelector('#home-button');
const waitingModal = document.querySelector('#waiting-modal');
const closeWaitingButton = document.querySelector('#close-waiting');
const serviceNow = document.querySelector('#service-now');
const serviceNowList = document.querySelector('#service-now-list');
const config = window.SUPABASE_CONFIG;
const supabaseClient = window.supabase.createClient(config.url, config.publishableKey);
const lastCheckinKey = 'portalUltimoCheckin';
let editingCheckin = null;

function normalizeCompanyName(value) {
  return value.trim().toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');
}

async function companyAlreadyCheckedInToday(companyName) {
  const normalizedName = normalizeCompanyName(companyName);
  if (normalizedName.length < 2) return false;
  const start = new Date();
  start.setHours(0,0,0,0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const { data,error } = await supabaseClient.from('motoristas')
    .select('empresa')
    .gte('criado_em',start.toISOString())
    .lt('criado_em',end.toISOString());
  if (error) {
    console.error('Erro ao verificar empresa:',error);
    return false;
  }
  return (data || []).some((record) => normalizeCompanyName(record.empresa || '') === normalizedName);
}

async function redirectIfCompanyExists() {
  if (editingCheckin || !companyInput.value.trim()) return false;
  const exists = await companyAlreadyCheckedInToday(companyInput.value);
  if (!exists) return false;
  localStorage.setItem('portalEmpresaAguardando',companyInput.value.trim());
  feedback.textContent = 'Esta empresa já realizou o check-in hoje. Abrindo a fila...';
  feedback.classList.remove('error');
  feedback.style.display = 'block';
  window.location.href = 'aguarde.html';
  return true;
}

function clearVisibleForm() {
  editingCheckin = null;
  form.reset();
  phoneInput.disabled = false;
  ddiInput.disabled = false;
  dddInput.disabled = false;
  phoneInput.required = true;
  ddiInput.required = true;
  dddInput.required = true;
  submitButton.innerHTML = 'REALIZAR CHECK-IN <span>›</span>';
  feedback.textContent = '';
  feedback.classList.remove('error');
  feedback.style.display = 'none';
}

function toTitleCase(value) {
  return value
    .toLocaleLowerCase('pt-BR')
    .replace(/(^|\s)(\p{L})/gu,(_,space,letter) => space + letter.toLocaleUpperCase('pt-BR'));
}

[companyInput,driverInput].forEach((input) => {
  input.addEventListener('input',() => { input.value = toTitleCase(input.value); });
});

companyInput.addEventListener('change',redirectIfCompanyExists);

[ddiInput,dddInput].forEach((input) => {
  input.addEventListener('input',() => {
    input.value = input.value.replace(/\D/g,'').slice(0,Number(input.maxLength));
  });
});

function formatPhoneNumber(value) {
  const digits = value.replace(/\D/g,'').slice(0,9);
  if (digits.length <= 4) return digits;
  const division = digits.length === 9 ? 5 : 4;
  return `${digits.slice(0,division)}-${digits.slice(division)}`;
}

phoneInput.addEventListener('input',() => {
  phoneInput.value = formatPhoneNumber(phoneInput.value);
});

noPhoneInput.addEventListener('change',() => {
  phoneInput.disabled = noPhoneInput.checked;
  ddiInput.disabled = noPhoneInput.checked;
  dddInput.disabled = noPhoneInput.checked;
  phoneInput.required = !noPhoneInput.checked;
  ddiInput.required = !noPhoneInput.checked;
  dddInput.required = !noPhoneInput.checked;
  if (noPhoneInput.checked) {
    phoneInput.value = '';
    dddInput.value = '';
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!editingCheckin && await redirectIfCompanyExists()) return;
  const data = new FormData(form);
  const originalText = submitButton.innerHTML;
  submitButton.disabled = true;
  submitButton.textContent = 'SALVANDO...';
  feedback.style.display = 'none';

  const checkinData = {
    empresa: data.get('empresa').trim(),
    motorista: data.get('motorista').trim(),
    celular: noPhoneInput.checked
      ? 'Sem telefone'
      : `+${data.get('ddi')} (${data.get('ddd')}) ${data.get('celular')}`,
    tipo_veiculo: data.get('tipoVeiculo')
  };
  let error = null;
  let savedRecord = null;

  if (editingCheckin) {
    const result = await supabaseClient.rpc('editar_checkin_motorista', {
      p_id: editingCheckin.id,
      p_token: editingCheckin.editToken,
      p_empresa: checkinData.empresa,
      p_motorista: checkinData.motorista,
      p_celular: checkinData.celular,
      p_tipo_veiculo: checkinData.tipo_veiculo
    });
    error = result.error;
  } else {
    const editToken = crypto.randomUUID();
    const result = await supabaseClient.from('motoristas').insert({
      ...checkinData,
      status: 'aguardando',
      edit_token: editToken
    }).select('id').single();
    error = result.error;
    if (!error) savedRecord = { id:result.data.id,editToken,...checkinData };
  }

  submitButton.disabled = false;
  submitButton.innerHTML = originalText;
  feedback.style.display = 'block';

  if (error) {
    console.error('Erro ao salvar check-in:', error);
    feedback.textContent = 'Não foi possível salvar. Verifique a conexão e tente novamente.';
    feedback.classList.add('error');
    return;
  }

  feedback.classList.remove('error');
  if (savedRecord) localStorage.setItem(lastCheckinKey,JSON.stringify(savedRecord));
  if (savedRecord) localStorage.setItem('portalEmpresaAguardando',savedRecord.empresa);
  if (editingCheckin) {
    localStorage.setItem(lastCheckinKey,JSON.stringify({ ...editingCheckin,...checkinData }));
  }
  const wasEditing = Boolean(editingCheckin);
  feedback.textContent = wasEditing ? 'Dados corrigidos com sucesso!' : 'Check-in realizado e salvo com sucesso!';
  feedback.style.display = 'block';
  editingCheckin = null;
  submitButton.innerHTML = 'REALIZAR CHECK-IN <span>›</span>';
  form.reset();
  phoneInput.disabled = false;
  ddiInput.disabled = false;
  dddInput.disabled = false;
  phoneInput.required = true;
  ddiInput.required = true;
  dddInput.required = true;
  if (!wasEditing) {
    window.location.href = 'aguarde.html';
    return;
  }
});

function closeWaitingModal() {
  waitingModal.hidden = true;
  document.body.classList.remove('modal-open');
}

closeWaitingButton.addEventListener('click',closeWaitingModal);
waitingModal.addEventListener('click',(event) => { if (event.target === waitingModal) closeWaitingModal(); });

async function loadCompaniesInService() {
  const { data,error } = await supabaseClient.from('motoristas')
    .select('id,empresa,criado_em')
    .eq('status','em_atendimento')
    .order('criado_em',{ ascending:true });
  if (error) {
    console.error('Erro ao consultar atendimentos:',error);
    return;
  }
  serviceNowList.textContent = '';
  (data || []).forEach((record) => {
    const company = document.createElement('strong');
    company.textContent = record.empresa;
    serviceNowList.appendChild(company);
  });
  serviceNow.hidden = !data?.length;
}

loadCompaniesInService();
setInterval(loadCompaniesInService,3000);
window.addEventListener('storage',(event) => {
  if (event.key === 'portalAtendimentosAtualizados') loadCompaniesInService();
});
document.addEventListener('visibilitychange',() => {
  if (!document.hidden) loadCompaniesInService();
});

editCheckinButton.addEventListener('click',(event) => {
  event.preventDefault();
  let lastCheckin = null;
  try { lastCheckin = JSON.parse(localStorage.getItem(lastCheckinKey)); } catch { lastCheckin = null; }
  if (!lastCheckin?.id || !lastCheckin?.editToken) {
    feedback.textContent = 'Nenhum check-in deste aparelho está disponível para correção.';
    feedback.classList.add('error');
    feedback.style.display = 'block';
    return;
  }
  editingCheckin = lastCheckin;
  companyInput.value = lastCheckin.empresa || '';
  driverInput.value = lastCheckin.motorista || '';
  vehicleTypeInput.value = lastCheckin.tipo_veiculo || '';
  const hasPhone = lastCheckin.celular && lastCheckin.celular !== 'Sem telefone';
  noPhoneInput.checked = !hasPhone;
  const savedDigits = hasPhone ? lastCheckin.celular.replace(/\D/g,'') : '';
  const hasCountryCode = savedDigits.length > 11;
  ddiInput.value = hasCountryCode ? savedDigits.slice(0,2) : '55';
  dddInput.value = hasCountryCode ? savedDigits.slice(2,4) : savedDigits.slice(0,2);
  phoneInput.value = formatPhoneNumber(hasCountryCode ? savedDigits.slice(4) : savedDigits.slice(2));
  phoneInput.disabled = !hasPhone;
  ddiInput.disabled = !hasPhone;
  dddInput.disabled = !hasPhone;
  phoneInput.required = hasPhone;
  ddiInput.required = hasPhone;
  dddInput.required = hasPhone;
  submitButton.textContent = 'SALVAR CORREÇÕES';
  feedback.textContent = 'Ajuste os dados e toque em “Salvar correções”.';
  feedback.classList.remove('error');
  feedback.style.display = 'block';
  companyInput.focus();
  window.scrollTo({ top:0,behavior:'smooth' });
});

homeButton.addEventListener('click',(event) => {
  event.preventDefault();
  clearVisibleForm();
  window.scrollTo({ top:0,behavior:'smooth' });
});

document.querySelectorAll('.bottom-nav a').forEach((item) => {
  item.addEventListener('click', () => {
    document.querySelector('.bottom-nav .selected')?.classList.remove('selected');
    item.classList.add('selected');
  });
});
