import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReportPhishNote, reportHref } from "./report-phish-note";

describe("reportHref", () => {
  it("turns an address into a mailto link", () => {
    expect(reportHref("phishing@acme.com")).toBe("mailto:phishing@acme.com");
  });

  it("passes an https link through", () => {
    expect(reportHref("https://intranet.acme.com/report")).toBe(
      "https://intranet.acme.com/report",
    );
  });

  it("refuses anything that would run when clicked", () => {
    // Last check before the value reaches an href.
    for (const attack of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "http://intranet.acme.com/report",
      "mailto:x@y.com",
      "not-a-channel",
      "",
    ]) {
      expect(reportHref(attack)).toBeNull();
    }
  });
});

describe("ReportPhishNote", () => {
  it("names the organisation's own address", () => {
    render(<ReportPhishNote channel="phishing@acme.com" instructions={null} orgName="Acme" />);
    const link = screen.getByRole("link", { name: "phishing@acme.com" });
    expect(link.getAttribute("href")).toBe("mailto:phishing@acme.com");
    expect(screen.getByText(/At Acme, report it/)).toBeTruthy();
  });

  it("shows any extra steps the admin wrote", () => {
    render(
      <ReportPhishNote
        channel="phishing@acme.com"
        instructions="Forward it as an attachment."
        orgName="Acme"
      />,
    );
    expect(screen.getByText("Forward it as an attachment.")).toBeTruthy();
  });

  it("opens an external form safely", () => {
    render(
      <ReportPhishNote channel="https://intranet.acme.com/report" instructions={null} />,
    );
    const link = screen.getByRole("link");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("does not use target=_blank for a mailto", () => {
    render(<ReportPhishNote channel="phishing@acme.com" instructions={null} />);
    expect(screen.getByRole("link").getAttribute("target")).toBeNull();
  });

  it("renders nothing when the organisation has configured no channel", () => {
    // Better silent than telling employees to "contact your security team".
    const { container } = render(<ReportPhishNote channel={null} instructions="ignored" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing rather than a hostile link", () => {
    const { container } = render(
      <ReportPhishNote channel="javascript:alert(1)" instructions={null} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
