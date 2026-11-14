/* Synthetic update flow. No network, filesystem, permission or installer operations. */
const updateStages = {
  idle: '尚未检查',
  checking: '正在检查更新',
  latest: '已是最新版本',
  available: '有新版本可用',
  downloading: '正在下载更新',
  verifying: '正在验证更新包',
  ready: '更新已准备好',
  permission: '需要允许安装应用',
  installing: '等待系统安装',
  restarting: '正在保存进度并重启',
  confirming: '正在确认安装结果',
  success: '更新完成',
  checkError: '暂时无法检查更新',
  downloadError: '下载中断',
  verifyError: '更新包验证失败',
  spaceError: '空间不足',
  saveError: '观看进度未能保存',
  installError: '安装未完成',
  manual: '请手动更新应用',
};
const updateDemos = Object.fromEntries(
  ['desktop', 'tv'].map((platform) => [
    platform,
    {
      stage: 'idle',
      progress: 0,
      autoCheck: true,
      permission: false,
      version: '0.1.0',
      timer: null,
      generation: 0,
    },
  ]),
);
function updateModel() {
  return updateDemos[state.mode];
}
function updateStageOptions() {
  const excluded =
    state.mode === 'tv'
      ? ['restarting', 'saveError']
      : ['permission', 'installing', 'installError'];
  return Object.entries(updateStages)
    .filter(([key]) => !excluded.includes(key))
    .map(
      ([key, title]) =>
        `<option value="${key}" ${updateModel().stage === key ? 'selected' : ''}>${title}</option>`,
    )
    .join('');
}
globalThis.syncUpdateReview = function syncUpdateReview() {
  const active = state.route === 'updates';
  $('#update-review').hidden = !active;
  $('#scenario').closest('label').hidden = active;
  $('.review-note').textContent = active
    ? '· 更新交互演示 · 版本与安装步骤均为模拟'
    : '· 虚构剧目与封面 · 仅演示交互';
  if (active) $('#update-scenario').innerHTML = updateStageOptions();
};
function setUpdateStage(stage, { platform = state.mode, run = true } = {}) {
  const model = updateDemos[platform];
  clearTimeout(model.timer);
  model.generation += 1;
  model.stage = stage;
  if (stage === 'downloading') model.progress = run ? 0 : 38;
  if (stage === 'success') model.version = '0.2.0';
  if (platform === state.mode && state.route === 'updates') {
    const focusedContent = content.contains(document.activeElement);
    render();
    if (focusedContent && !content.contains(document.activeElement) && !overlay.open)
      ($('[data-update-primary]', content) || $('.update-back', content))?.focus({
        preventScroll: true,
      });
  }
  if (!run) return;
  const generation = model.generation;
  const later = (delay, callback) => {
    model.timer = setTimeout(() => {
      if (generation === model.generation) callback();
    }, delay);
  };
  if (stage === 'checking')
    later(1100, () =>
      setUpdateStage(model.version === '0.2.0' ? 'latest' : 'available', { platform }),
    );
  if (stage === 'verifying') later(1400, () => setUpdateStage('ready', { platform }));
  if (stage === 'restarting') later(2000, () => setUpdateStage('confirming', { platform }));
  if (stage === 'confirming') later(1400, () => setUpdateStage('success', { platform }));
  if (stage === 'downloading') {
    const tick = () => {
      model.progress = Math.min(100, model.progress + 10);
      if (platform === state.mode && state.route === 'updates') {
        const progress = $('.update-progress', content);
        if (progress) progress.value = model.progress;
        const caption = $('.update-progress-caption', content);
        if (caption) caption.textContent = updateProgressText();
      }
      if (model.progress === 100) setUpdateStage('verifying', { platform });
      else later(900, tick);
    };
    later(900, tick);
  }
}
function updateProgressText() {
  const model = updateModel();
  const size = state.mode === 'tv' ? 96 : 128;
  return `${Math.round((size * model.progress) / 100)} / ${size} MB · ${model.progress}%`;
}
function updateAction(label, action, primary = false) {
  return button(label, `update-${action}`, {
    variant: primary ? 'primary' : '',
    attrs: primary ? 'data-update-primary data-tv-initial' : '',
  });
}
globalThis.updatePage = function updatePage() {
  const model = updateModel();
  const tv = state.mode === 'tv';
  const stage = model.stage;
  const busy = ['checking', 'downloading', 'verifying', 'restarting', 'confirming'].includes(stage);
  const error = stage.endsWith('Error');
  const descriptions = {
    idle: '检查是否有适合这台设备的新版本。',
    checking: '正在获取适合这台设备的版本。',
    latest: `当前版本 ${model.version}。`,
    available: '下载完成后，由你决定何时安装。',
    downloading: '可以离开此页继续观看，下载会在后台继续。',
    verifying: '验证通过后才能安装，你可以先继续观看。',
    ready: tv ? '安装会暂时离开红果，完成后重新打开应用。' : '重启前会保存观看进度。',
    permission: '在系统设置中允许红果安装应用，再返回这里继续。',
    installing: '请在系统安装器中确认；取消后可回到这里重新安装。',
    restarting: '请稍候，完成后会恢复你的观看位置。',
    confirming: '正在核对重新打开后的应用版本。',
    success: '已更新到 0.2.0，可以继续观看了。',
    checkError: '未能连接更新服务，请检查网络后重试。',
    downloadError: '网络连接已中断，请检查网络后重新下载。',
    verifyError: '安装包已丢弃，请重新下载。',
    spaceError: `请先腾出至少 ${tv ? '300' : '400'} MB 空间，再重新下载。`,
    saveError: '本次未重启。请重试保存，或稍后再更新。',
    installError: '安装包已保留，请重新安装；若仍失败，可手动更新。',
    manual: '当前安装方式不支持应用内安装，请前往发行页获取安装包。',
  };
  let actions = '';
  if (['idle', 'latest', 'checkError'].includes(stage))
    actions = updateAction(stage === 'checkError' ? '重试' : '检查更新', 'check', true);
  if (['available', 'downloadError', 'verifyError'].includes(stage))
    actions = updateAction(stage === 'available' ? '下载更新' : '重新下载', 'download', true);
  if (stage === 'ready') actions = updateAction(tv ? '安装更新' : '重启更新', 'install', true);
  if (stage === 'permission') actions = updateAction('前往设置', 'permission', true);
  if (stage === 'installing') actions = updateAction('打开系统安装器', 'installer', true);
  if (stage === 'saveError') actions = updateAction('重试保存并重启', 'install', true);
  if (stage === 'spaceError')
    actions = updateAction('管理空间', 'space', true) + updateAction('重新下载', 'download');
  if (stage === 'installError')
    actions = updateAction('重新安装', 'install', true) + updateAction('手动更新', 'manual');
  if (stage === 'manual')
    actions =
      '<a class="ui-button btn primary" data-update-primary data-tv-initial href="https://github.com/bijinfeng/hongguo-tv/releases" target="_blank" rel="noopener noreferrer">前往发行页</a>';
  if (stage === 'success') actions = updateAction('继续找剧', 'done', true);
  if (tv && stage === 'downloading') actions += updateAction('取消下载', 'cancel');
  if (!['success', 'idle', 'latest'].includes(stage))
    actions += updateAction(state.playbackStarted ? '返回播放' : '先去找剧', 'leave');
  const hasRelease = !['idle', 'checking', 'latest', 'checkError', 'success', 'manual'].includes(
    stage,
  );
  return `<div class="update-page ${tv ? 'update-tv' : ''}">
    <div class="update-heading"><button class="ui-button btn quiet update-back" data-action="update-back">${icon('back')}返回设置</button><h1>应用更新</h1></div>
    <div class="update-layout">
      <section class="update-main" aria-label="更新操作">
        <p class="update-current">当前版本 ${model.version}${tv ? ' · Android TV' : ' · 桌面端'}</p>
        <div class="update-status" aria-live="polite" aria-atomic="true"><h2>${updateStages[stage]}</h2><p>${descriptions[stage]}</p></div>
        ${hasRelease ? `<p class="update-release">0.2.0 <span>· ${tv ? '96' : '128'} MB</span></p>` : ''}
        ${stage === 'downloading' ? `<div class="update-progress-block"><progress class="update-progress" max="100" value="${model.progress}" aria-label="更新包下载进度"></progress><p class="update-progress-caption">${updateProgressText()}</p></div>` : ''}
        ${busy && stage !== 'downloading' ? '<p class="update-wait">请稍候…</p>' : ''}
        <div class="update-actions">${actions}</div>
        ${error ? '<p class="update-recovery">现有版本仍可正常使用。</p>' : ''}
      </section>
      ${hasRelease ? `<aside class="update-notes" aria-label="更新说明"><h2>本次更新</h2><ul><li>继续观看时，更准确地恢复到上次位置</li><li>切换剧集更顺畅</li><li>${tv ? '改善遥控器焦点与返回体验' : '改善窗口与键盘操作体验'}</li></ul><p class="update-fixture">演示更新说明</p></aside>` : ''}
    </div>
    <div class="update-preferences">${settingRow('自动检查更新', `<button class="switch" role="switch" aria-checked="${model.autoCheck}" aria-label="自动检查更新" data-action="update-auto"><span></span></button>`, '发现新版本时提醒，下载前由你确认')}</div>
  </div>`;
};
function updateSystemDialog(kind) {
  const permission = kind === 'permission';
  const space = kind === 'space';
  const title = space
    ? '存储管理 · 系统步骤示意'
    : permission
      ? '安装授权 · 系统步骤示意'
      : '安装确认 · 系统步骤示意';
  const message = space
    ? '在系统中清理不需要的文件，然后返回应用重新下载。'
    : permission
      ? '正式应用会打开系统设置。允许红果安装应用后，返回应用继续安装。'
      : '正式应用会打开 Android 系统安装器，由你确认安装红果的新版本。';
  showDialog(
    title,
    `<p>${message}</p><div class="actions">${button(space ? '返回应用' : permission ? '暂不允许' : '取消安装', 'update-system-cancel', { value: kind })}${space ? '' : updateAction(permission ? '模拟已允许，返回应用' : '模拟确认安装', permission ? 'allowed' : 'confirmed', true)}</div>`,
  );
  overlay.dataset.updateStep = kind;
}
globalThis.closeUpdateSystemStep = function closeUpdateSystemStep() {
  if (
    !overlay.open &&
    overlay.dataset.updateStep === 'installer' &&
    updateModel().stage === 'installing'
  ) {
    setUpdateStage('ready');
  }
  if (!overlay.open) delete overlay.dataset.updateStep;
};
globalThis.handleUpdateAction = function handleUpdateAction(action, value) {
  switch (action) {
    case 'update-back':
      state.settingTab = '关于';
      if (stack.length) back();
      else navigate('settings', null, { push: false });
      break;
    case 'update-check':
      setUpdateStage('checking');
      break;
    case 'update-download':
      setUpdateStage('downloading');
      break;
    case 'update-cancel':
      setUpdateStage('available');
      break;
    case 'update-leave':
      navigate(state.playbackStarted ? 'player' : 'home', state.id);
      break;
    case 'update-done':
      navigate('home');
      break;
    case 'update-install':
      if (state.mode === 'desktop') setUpdateStage('restarting');
      else if (!updateModel().permission) setUpdateStage('permission');
      else {
        setUpdateStage('installing');
        updateSystemDialog('installer');
      }
      break;
    case 'update-permission':
      updateSystemDialog('permission');
      break;
    case 'update-installer':
      updateSystemDialog('installer');
      break;
    case 'update-space':
      updateSystemDialog('space');
      break;
    case 'update-allowed':
      overlay.close();
      updateModel().permission = true;
      setUpdateStage('ready');
      break;
    case 'update-confirmed':
      delete overlay.dataset.updateStep;
      overlay.close();
      // Installer acceptance is not success. Reopen/version confirmation is separate.
      showDialog(
        '系统安装步骤示意',
        `<p>模拟安装已完成。重新打开应用后，才会核对版本并显示更新结果。</p><div class="actions">${updateAction('模拟重新打开应用', 'reopen', true)}</div>`,
      );
      break;
    case 'update-reopen':
      overlay.close();
      setUpdateStage('confirming');
      break;
    case 'update-system-cancel':
      overlay.close();
      if (value === 'installer') setUpdateStage('ready');
      break;
    case 'update-manual':
      setUpdateStage('manual');
      break;
    case 'update-auto':
      updateModel().autoCheck = !updateModel().autoCheck;
      render();
      break;
  }
};
