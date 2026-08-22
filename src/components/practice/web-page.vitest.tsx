import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WebPage, splitUrl } from "./web-page";

const props = {
  url: "https://login.micros0ft-verify.com/session/auth",
  headline: "Sign in to continue",
  body: "Your session expired. Confirm your credentials to restore access to your mailbox.",
  secondaryLink: "Forgot your password?",
};

describe("splitUrl", () => {
  it("emphasises the registrable domain, not the subdomain", () => {
    expect(splitUrl("https://login.micros0ft-verify.com/session")).toEqual({
      prefix: "https://login.",
      domain: "micros0ft-verify.com",
      rest: "/session",
    });
  });

  it("handles a bare two-label host", () => {
    expect(splitUrl("https://example.com/x")).toEqual({
      prefix: "https://",
      domain: "example.com",
      rest: "/x",
    });
  });

  it("handles a URL with no path", () => {
    expect(splitUrl("http://example.com")).toEqual({
      prefix: "http://",
      domain: "example.com",
      rest: "",
    });
  });

  it("reassembles to the original address in every case", () => {
    for (const url of [
      "https://a.b.c.example.co/p?q=1",
      "https://example.com",
      "http://x.example.com/a/b#c",
      "example.com/path",
    ]) {
      const { prefix, domain, rest } = splitUrl(url);
      expect(prefix + domain + rest).toBe(url);
    }
  });
});

describe("WebPage", () => {
  it("shows the address bar and the page copy", () => {
    render(<WebPage {...props} />);
    expect(screen.getByText("micros0ft-verify.com")).toBeInTheDocument();
    expect(screen.getByText("Sign in to continue")).toBeInTheDocument();
    expect(screen.getByText(/session expired/i)).toBeInTheDocument();
  });

  it("cannot be filled in, so a trainee cannot type a real password into a simulation", () => {
    render(<WebPage {...props} />);
    expect(screen.getByLabelText(/password/i)).toBeDisabled();
    expect(screen.getByLabelText(/email or username/i)).toBeDisabled();
    // No submit path exists at all.
    expect(screen.queryByRole("button", { name: /^sign in$/i })).not.toBeInTheDocument();
  });

  it("renders nothing navigable", () => {
    render(<WebPage {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /connection details/i }));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("explains that the padlock is about encryption, not identity", () => {
    render(<WebPage {...props} />);
    expect(screen.queryByText(/does not say who is on the other end/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /connection details/i }));
    expect(screen.getByText(/connection is encrypted/i)).toBeInTheDocument();
    expect(screen.getByText(/does not say who is on the other end/i)).toBeInTheDocument();
  });

  it("flags a plain-HTTP page instead of showing a padlock", () => {
    render(<WebPage {...props} url="http://login.example-verify.com/session" />);
    fireEvent.click(screen.getByRole("button", { name: /connection details/i }));
    expect(screen.getByText(/connection is not private/i)).toBeInTheDocument();
  });

  it("omits the secondary link when the scenario has none", () => {
    render(<WebPage {...props} secondaryLink={null} />);
    expect(screen.queryByText(/forgot your password/i)).not.toBeInTheDocument();
  });
});
