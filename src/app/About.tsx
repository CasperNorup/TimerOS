import { useEffect, useState } from "react";
import { version } from "../../package.json";
import icon from "../assets/branding/TimerOS-app-icon-transparent.png";
import { Dialog } from "./Dialog";
import { useLocale } from "./locale";

const contact = "CasperRNorup@gmail.com";

export function About({ close }: { close: () => void }) {
  const { t } = useLocale();
  const [viewLicenses, setViewLicenses] = useState(false);
  const [notices, setNotices] = useState("");
  const [licenseError, setLicenseError] = useState(false);
  const [contactStatus, setContactStatus] = useState("");
  useEffect(() => {
    if (!viewLicenses || notices) return;
    const request = new AbortController();
    fetch(import.meta.env.BASE_URL + "licenses/third-party.txt", { signal: request.signal })
      .then(response => {
        if (!response.ok) throw new Error();
        return response.text();
      }).then(contents => {
        if (!request.signal.aborted) setNotices(contents);
      }).catch(() => {
        if (!request.signal.aborted) setLicenseError(true);
      });
    return () => request.abort();
  }, [viewLicenses, notices]);

  async function openMail() {
    setContactStatus("");
    const native = (window as Window & { __TAURI__?: { core: { invoke(name: string): Promise<unknown> } } }).__TAURI__?.core;
    try {
      if (native) await native.invoke("open_feedback");
      else window.location.href = "mailto:" + contact;
    } catch {
      setContactStatus("Your mail app could not be opened. You can copy the address below.");
    }
  }

  return <Dialog title={t(viewLicenses ? "Third-party licenses" : "About TimerOS")} close={close}>
    {viewLicenses ? <>
      {notices ? <pre className="license-notices" aria-label={t("Third-party notices")} tabIndex={0}>{notices}</pre>
        : <p role="status">{t(licenseError ? "The license notices could not be loaded." : "Loading license notices…")}</p>}
      <div className="controls dialog-actions">
        <button type="button" onClick={() => { setLicenseError(false); setViewLicenses(false); }}>{t("Back to About")}</button>
      </div>
    </> : <div className="about-content">
      <div className="about-brand"><img src={icon} width={46} height={46} alt="" />
        <div><strong>TimerOS</strong><span>{t("Version {version}", { version })}</span></div>
      </div>
      <p>{t("Created by Casper Norup")}</p>
      <p>© 2026 Casper Norup</p>
      <h3>{t("Contact & feedback")}</h3>
      <a href={"mailto:" + contact} onClick={event => { event.preventDefault(); void openMail(); }}>{contact}</a>
      <div className="controls contact-actions">
        <button type="button" onClick={() => void navigator.clipboard.writeText(contact)
          .then(() => setContactStatus("Email address copied."))
          .catch(() => setContactStatus("Select the address to copy it."))}>{t("Copy email address")}</button>
      </div>
      {contactStatus && <p role="status">{t(contactStatus)}</p>}
      <button type="button" className="text-button" onClick={() => setViewLicenses(true)}>{t("Third-party licenses")}</button>
    </div>}
  </Dialog>;
}
