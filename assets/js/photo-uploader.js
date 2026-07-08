/* =========================================================
 * Photo Uploader (erp-storyboard 인사 IA 이식 — 사원 등록 사진 업로더)
 *
 * 마크업: .id-photo-uploader[data-photo-uploader] >
 *   .id-photo-uploader__photo > .id-photo[data-photo-preview] >
 *     .id-photo-uploader__placeholder (사진 없을 때 표시)
 *   .id-photo-uploader__actions > [data-photo-upload] / [data-photo-remove]
 *   <input type="file" hidden data-photo-input />
 *
 * - 업로드: 파일 선택 → FileReader 로 dataURL 변환 → preview <img> 삽입
 *   · 2MB 초과 또는 image/* 가 아니면 무시 + window.toast 안내
 * - 삭제: preview 초기화 + placeholder 복원
 * - 상태: 컨테이너에 data-has-photo="true|false" 토글 → CSS 가 placeholder 숨김 처리
 * - 외부 API: App.PhotoUploader.{reset, getDataURL, setDataURL}
 *
 * 원본: erp-storyboard/assets/js/ui-kit.js (라인 1072~1162)
 * ========================================================= */
(function () {
  const $$ = (s, r = document) => r.querySelectorAll(s);

  const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
  function findUploader(el) { return el && el.closest('[data-photo-uploader]'); }
  function getPreview(host) { return host && host.querySelector('[data-photo-preview]'); }
  function getPlaceholderHTML(host) {
    if (!host.__placeholderHTML) {
      const p = host.querySelector('.id-photo-uploader__placeholder');
      host.__placeholderHTML = p ? p.outerHTML : '<div class="id-photo-uploader__placeholder"><span>사진 없음</span></div>';
    }
    return host.__placeholderHTML;
  }
  function setPhotoState(host, dataURL) {
    const preview = getPreview(host);
    if (!preview) return;
    if (dataURL) {
      preview.innerHTML = `<img src="${dataURL}" alt="" />`;
      host.setAttribute('data-has-photo', 'true');
      const rm = host.querySelector('[data-photo-remove]');
      if (rm) rm.disabled = false;
    } else {
      preview.innerHTML = getPlaceholderHTML(host);
      host.setAttribute('data-has-photo', 'false');
      const rm = host.querySelector('[data-photo-remove]');
      if (rm) rm.disabled = true;
      const input = host.querySelector('[data-photo-input]');
      if (input) input.value = '';
    }
    host.dataset.photoUrl = dataURL || '';
    host.dispatchEvent(new CustomEvent('photo:change', { bubbles: true, detail: { dataURL } }));
  }

  function initExisting() {
    $$('[data-photo-uploader]').forEach(host => { getPlaceholderHTML(host); host.setAttribute('data-has-photo', 'false'); });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExisting);
  } else {
    initExisting();
  }

  document.addEventListener('click', (e) => {
    const up = e.target.closest('[data-photo-upload]');
    if (up) {
      const host = findUploader(up);
      const input = host && host.querySelector('[data-photo-input]');
      if (input) input.click();
      return;
    }
    const rm = e.target.closest('[data-photo-remove]');
    if (rm) {
      const host = findUploader(rm);
      if (host) setPhotoState(host, '');
    }
  });

  document.addEventListener('change', (e) => {
    const input = e.target.closest('[data-photo-input]');
    if (!input) return;
    const host = findUploader(input);
    if (!host) return;
    const file = input.files && input.files[0];
    if (!file) return;
    if (!/^image\/(png|jpe?g)$/i.test(file.type)) {
      window.toast && window.toast('JPG 또는 PNG 이미지만 업로드할 수 있습니다.', 'warning');
      input.value = ''; return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      window.toast && window.toast('파일 크기가 2MB를 초과합니다.', 'warning');
      input.value = ''; return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhotoState(host, reader.result);
    reader.readAsDataURL(file);
  });

  window.App = window.App || {};
  window.App.PhotoUploader = {
    reset(host)        { if (host) { getPlaceholderHTML(host); setPhotoState(host, ''); } },
    getDataURL(host)   { return host ? (host.dataset.photoUrl || '') : ''; },
    setDataURL(host, u){ if (host) { getPlaceholderHTML(host); setPhotoState(host, u || ''); } },
  };
})();
