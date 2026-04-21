let _open = false;
let _pendingResolve = null;
let _pendingPromise = null;
let _wired = false;

function _els() {
    return {
        overlay: document.getElementById("confirm-modal-overlay"),
        message: document.getElementById("confirm-modal-message"),
        yes: document.getElementById("confirm-modal-yes"),
        no: document.getElementById("confirm-modal-no"),
    };
}

function _close(value) {
    const { overlay } = _els();
    _open = false;
    if (overlay) overlay.classList.remove("active");

    const resolve = _pendingResolve;
    _pendingResolve = null;
    _pendingPromise = null;
    resolve?.(value);
}

function _wireOnce() {
    if (_wired) return;
    _wired = true;

    const { overlay, yes, no } = _els();
    if (!overlay || !yes || !no) return;

    yes.addEventListener("click", () => _open && _close(true));
    no.addEventListener("click", () => _open && _close(false));

    // Clicking the dimmed backdrop behaves like "No".
    overlay.addEventListener("click", (ev) => {
        if (ev.target === overlay && _open) _close(false);
    });
}

export function isConfirmModalOpen() {
    return _open;
}

export function showConfirm(message) {
    const { overlay, message: msgEl, yes, no } = _els();

    // Fallback: if markup wasn't found for some reason, keep behavior usable.
    if (!overlay || !msgEl || !yes || !no) return Promise.resolve(window.confirm(message));

    _wireOnce();

    msgEl.textContent = String(message ?? "");
    overlay.classList.add("active");
    _open = true;

    // If already open, update the message and reuse the same promise.
    if (_pendingPromise) return _pendingPromise;

    _pendingPromise = new Promise((resolve) => {
        _pendingResolve = resolve;
    });

    return _pendingPromise;
}

