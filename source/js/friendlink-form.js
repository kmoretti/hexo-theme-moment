(() => {
  const root = document.querySelector('[data-friendlink-form-root]');
  if (!root) return;

  const conditions = Array.from(root.querySelectorAll('[data-friendlink-condition]'));
  const conditionHint = root.querySelector('[data-friendlink-condition-hint]');
  const unavailable = root.querySelector('[data-friendlink-unavailable]');
  const modes = root.querySelector('[data-friendlink-modes]');
  const modeButtons = Array.from(root.querySelectorAll('[data-friendlink-mode]'));
  const forms = Array.from(root.querySelectorAll('[data-friendlink-form]'));
  if (!modes || !forms.length) return;

  const timeoutMs = 12000;
  const fieldNames = ['name', 'url', 'description', 'avatar', 'friendslink', 'siteshot', 'feeds', 'email'];
  const urlFields = ['url', 'avatar', 'friendslink', 'siteshot', 'feeds'];
  const controllers = new Map();
  const successPanels = new Map();
  let activeMode = '';

  const text = value => String(value == null ? '' : value).trim();
  const setVisibleText = (element, value) => {
    element.textContent = value;
    element.hidden = !value;
  };
  const safeEndpoint = value => {
    const source = text(value);
    if (!source) return '';
    try {
      const url = new URL(source);
      return url.protocol === 'https:' ? url.toString() : '';
    } catch (_) {
      return '';
    }
  };
  const safeHttpUrl = value => {
    const source = text(value);
    if (!source) return '';
    try {
      const url = new URL(source);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.toString() : '';
    } catch (_) {
      return '';
    }
  };
  const allConditionsAccepted = () => conditions.length > 0 && conditions.every(input => input.checked);
  const getField = (form, name) => form.querySelector(`[name="${name}"]`);
  const getModeButton = type => modeButtons.find(button => button.dataset.friendlinkMode === type);
  const getForm = type => forms.find(form => form.dataset.submissionType === type);
  const clearMessages = form => {
    setVisibleText(form.querySelector('[data-friendlink-error]'), '');
    setVisibleText(form.querySelector('[data-friendlink-status]'), '');
  };
  const setBusy = (form, busy) => {
    const submit = form.querySelector('[data-friendlink-submit]');
    const type = form.dataset.submissionType;
    form.querySelectorAll('input, textarea').forEach(control => { control.disabled = busy; });
    // 条件保留可操作性：用户取消确认时会中止当前等待并收起入口。
    modeButtons.forEach(control => { control.disabled = busy; });
    submit.disabled = busy;
    submit.textContent = busy ? '正在投递……' : (type === 'update' ? '提交更新' : '投递申请');
    form.setAttribute('aria-busy', String(busy));
  };
  const cancelRequest = form => {
    const request = controllers.get(form);
    if (!request) return;
    controllers.delete(form);
    request.cancelled = true;
    request.controller.abort();
    setBusy(form, false);
  };
  const cancelAllRequests = () => forms.forEach(cancelRequest);
  const resetCustomValidity = form => Array.from(form.elements).forEach(field => {
    if (typeof field.setCustomValidity === 'function') field.setCustomValidity('');
  });
  const markInvalid = (field, message) => {
    field.setCustomValidity(message);
    return field;
  };
  const validateForm = form => {
    const type = form.dataset.submissionType;
    resetCustomValidity(form);
    const values = {};
    const names = type === 'update' ? ['originalUrl', ...fieldNames] : fieldNames;
    names.forEach(name => {
      const field = getField(form, name);
      values[name] = field ? text(field.value) : '';
      if (field && field.value !== values[name]) field.value = values[name];
    });

    const invalid = [];
    const requiredNames = type === 'update'
      ? ['originalUrl', 'name', 'url', 'avatar', 'friendslink']
      : ['name', 'url', 'avatar', 'friendslink'];
    requiredNames.forEach(name => {
      const field = getField(form, name);
      if (!values[name]) invalid.push(markInvalid(field, '请填写此项。'));
    });
    const urlNames = type === 'update' ? ['originalUrl', ...urlFields] : urlFields;
    urlNames.forEach(name => {
      const field = getField(form, name);
      if (values[name] && !safeHttpUrl(values[name])) {
        invalid.push(markInvalid(field, '请输入不含账号密码、以 http:// 或 https:// 开头的有效网址。'));
      }
    });
    const email = getField(form, 'email');
    if (values.email && email.validity.typeMismatch) invalid.push(markInvalid(email, '请输入有效的邮箱地址。'));
    if (invalid.length) {
      invalid[0].focus();
      form.reportValidity();
      return null;
    }

    const payload = { type };
    if (type === 'update') payload.originalUrl = values.originalUrl;
    fieldNames.forEach(name => {
      if (values[name]) payload[name] = values[name];
    });
    return payload;
  };
  const getResponseError = async response => {
    try {
      const body = await response.json();
      const message = text(body && body.error);
      return message && message.length <= 240 ? message : '';
    } catch (_) {
      return '';
    }
  };
  const submissionError = message => {
    const exception = new Error(message);
    exception.isFriendlinkSubmissionError = true;
    return exception;
  };
  const renderSuccess = (form, type, hasEmail) => {
    const success = document.createElement('div');
    success.className = 'friendlink-success';
    success.tabIndex = -1;
    success.setAttribute('role', 'status');
    success.setAttribute('aria-live', 'polite');
    const mark = document.createElement('span');
    mark.className = 'friendlink-success__mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = '✓';
    const title = document.createElement('h3');
    title.textContent = type === 'update' ? '更新请求已投递' : '名片已投递';
    const description = document.createElement('p');
    const action = type === 'update' ? '友链更新请求' : '友链申请';
    description.textContent = hasEmail
      ? `${action}已提交，等待站长审核；结果会发送到你填写的邮箱。`
      : `${action}已提交，等待站长审核。`;
    success.append(mark, title, description);
    form.hidden = true;
    form.after(success);
    successPanels.set(type, success);
    success.focus();
  };
  const showMode = (type, focus = true) => {
    if (!allConditionsAccepted()) return;
    const next = getForm(type);
    if (!next) return;
    forms.forEach(form => {
      const formType = form.dataset.submissionType;
      const isTarget = form === next;
      const success = successPanels.get(formType);
      if (!isTarget) {
        const focusedInside = form.contains(document.activeElement) || Boolean(success && success.contains(document.activeElement));
        cancelRequest(form);
        clearMessages(form);
        form.hidden = true;
        if (success) success.hidden = true;
        if (focusedInside) getModeButton(type)?.focus();
      }
    });
    activeMode = type;
    modeButtons.forEach(button => {
      const active = button.dataset.friendlinkMode === type;
      button.setAttribute('aria-pressed', String(active));
    });
    const success = successPanels.get(type);
    if (success) {
      success.hidden = false;
      if (focus) success.focus();
    } else {
      next.hidden = false;
      if (focus) next.querySelector('.friendlink-form__title')?.focus();
    }
  };
  const updateVisibility = focusTarget => {
    const accepted = allConditionsAccepted();
    if (accepted) {
      modes.hidden = false;
      if (conditionHint) {
        conditionHint.hidden = true;
        conditionHint.textContent = '请先勾选所有确认项，再选择申请或更新。';
      }
      return;
    }
    const focusedInside = forms.some(form => form.contains(document.activeElement)) || Array.from(successPanels.values()).some(panel => panel.contains(document.activeElement));
    cancelAllRequests();
    forms.forEach(form => {
      clearMessages(form);
      form.hidden = true;
    });
    successPanels.forEach(panel => { panel.hidden = true; });
    activeMode = '';
    modes.hidden = true;
    modeButtons.forEach(button => button.setAttribute('aria-pressed', 'false'));
    if (conditionHint) {
      conditionHint.hidden = false;
      conditionHint.textContent = '申请条件未全部确认，操作入口已收起。';
    }
    if (focusedInside) (focusTarget || conditions[0])?.focus();
  };

  const endpoint = safeEndpoint(root.dataset.endpoint);
  if (!endpoint) {
    conditions.forEach(input => { input.disabled = true; });
    modeButtons.forEach(button => { button.disabled = true; });
    forms.forEach(form => {
      form.hidden = true;
      form.querySelectorAll('input, textarea, button').forEach(element => { element.disabled = true; });
    });
    if (conditionHint) conditionHint.hidden = true;
    setVisibleText(unavailable, '友链申请服务暂未配置，请稍后再来。');
    return;
  }

  conditions.forEach(input => input.addEventListener('change', () => updateVisibility(input)));
  modeButtons.forEach(button => button.addEventListener('click', () => showMode(button.dataset.friendlinkMode)));
  forms.forEach(form => {
    form.addEventListener('input', event => {
      if (typeof event.target.setCustomValidity === 'function') event.target.setCustomValidity('');
      if (event.target.matches('[name]')) clearMessages(form);
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const type = form.dataset.submissionType;
      if (!allConditionsAccepted() || activeMode !== type || controllers.has(form)) return;
      const payload = validateForm(form);
      if (!payload) return;

      clearMessages(form);
      const request = { controller: new AbortController(), cancelled: false, timedOut: false };
      controllers.set(form, request);
      const timeout = window.setTimeout(() => {
        if (controllers.get(form) === request) {
          request.timedOut = true;
          request.controller.abort();
        }
      }, timeoutMs);
      setBusy(form, true);
      setVisibleText(form.querySelector('[data-friendlink-status]'), '正在投递这张名片……');
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'omit',
          body: JSON.stringify(payload),
          signal: request.controller.signal,
        });
        if (controllers.get(form) !== request || request.cancelled || form.hidden) return;
        if (response.status !== 201) {
          const serverError = await getResponseError(response);
          if (response.status === 400 && serverError) throw submissionError(serverError);
          throw submissionError('申请暂时无法投递，请检查信息后稍后重试。');
        }
        renderSuccess(form, type, Boolean(payload.email));
      } catch (caught) {
        if (controllers.get(form) !== request || request.cancelled || form.hidden) return;
        const aborted = caught && caught.name === 'AbortError';
        setVisibleText(form.querySelector('[data-friendlink-error]'), aborted && request.timedOut
          ? '投递等待超时，提交结果未知，请勿立即重复投递；稍后确认审核状态或联系站长。'
          : (caught && caught.isFriendlinkSubmissionError
            ? text(caught.message)
            : '网络暂时无法连接申请服务，请稍后重试。'));
      } finally {
        window.clearTimeout(timeout);
        if (controllers.get(form) === request) {
          controllers.delete(form);
          if (form.isConnected) {
            setBusy(form, false);
            setVisibleText(form.querySelector('[data-friendlink-status]'), '');
          }
        }
      }
    });
  });
  updateVisibility();
})();
