import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QrNotice } from "./qr-notice";

const props = {
  organisation: "Facilities Management",
  headline: "Parking permit renewal required",
  body: "Scan the code below to renew before Friday.",
  destination: "https://permits-renew.example-portal.co/login",
};

describe("QrNotice", () => {
  it("renders the notice as printed material, not a message", () => {
    render(<QrNotice {...props} />);
    expect(screen.getByText("Facilities Management")).toBeInTheDocument();
    expect(screen.getByText("Parking permit renewal required")).toBeInTheDocument();
    expect(screen.getByText(/Posted notice/i)).toBeInTheDocument();
  });

  it("hides the destination until the learner asks", () => {
    render(<QrNotice {...props} />);
    expect(screen.queryByText(props.destination)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /where does this go/i }));
    expect(screen.getByText(props.destination)).toBeInTheDocument();
  });

  it("reveals on focus, so a keyboard user gets what a mouse user gets", () => {
    render(<QrNotice {...props} />);
    fireEvent.focus(screen.getByRole("button", { name: /where does this go/i }));
    expect(screen.getByText(props.destination)).toBeInTheDocument();
  });

  it("never renders the destination as a navigable link", () => {
    render(<QrNotice {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /where does this go/i }));
    // A real anchor would invite the trainee to leave the platform for a URL
    // built to look hostile. The destination is text only.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("labels the code as decorative and not scannable", () => {
    render(<QrNotice {...props} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAccessibleName(/not scannable/i);
  });

  it("renders the same pattern for the same destination", () => {
    const { container: a, unmount } = render(<QrNotice {...props} />);
    const first = a.querySelectorAll(".bg-slate-900").length;
    unmount();
    const { container: b } = render(<QrNotice {...props} />);
    expect(b.querySelectorAll(".bg-slate-900").length).toBe(first);
  });

  it("renders a different pattern for a different destination", () => {
    const { container: a, unmount } = render(<QrNotice {...props} />);
    const first = Array.from(a.querySelectorAll(".grid > span")).map((n) =>
      n.className.includes("bg-slate-900") ? 1 : 0,
    );
    unmount();
    const { container: b } = render(
      <QrNotice {...props} destination="https://totally-different.example/x" />,
    );
    const second = Array.from(b.querySelectorAll(".grid > span")).map((n) =>
      n.className.includes("bg-slate-900") ? 1 : 0,
    );
    expect(second).not.toEqual(first);
  });

  it("says so plainly when no destination was recorded", () => {
    render(<QrNotice {...props} destination={null} />);
    fireEvent.click(screen.getByRole("button", { name: /where does this go/i }));
    expect(screen.getByText(/No destination was recorded/i)).toBeInTheDocument();
  });
});
