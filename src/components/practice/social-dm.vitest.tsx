import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SocialDm, splitProfile } from "./social-dm";

const props = {
  sender: "Dana Whitfield (@d.whitfield-recruiting)",
  body: "Hi! I came across your profile and we have a role that fits exactly. Can you confirm your details here?",
  link: "https://careers-portal.talent-verify.co/apply",
};

describe("splitProfile", () => {
  it("separates the display name from the handle", () => {
    expect(splitProfile("Dana Whitfield (@d.whitfield)")).toEqual({
      name: "Dana Whitfield",
      handle: "@d.whitfield",
    });
  });

  it("keeps a handle that arrived without an @", () => {
    expect(splitProfile("Dana Whitfield (d.whitfield)")).toEqual({
      name: "Dana Whitfield",
      handle: "d.whitfield",
    });
  });

  it("still renders a bare name the generator returned without a handle", () => {
    expect(splitProfile("Dana Whitfield")).toEqual({ name: "Dana Whitfield", handle: null });
  });

  it("does not choke on parentheses inside the name", () => {
    expect(splitProfile("Dana Whitfield (Recruiting) (@dw)")).toEqual({
      name: "Dana Whitfield (Recruiting)",
      handle: "@dw",
    });
  });
});

describe("SocialDm", () => {
  it("renders as a message request rather than an inbox item", () => {
    render(<SocialDm {...props} />);
    expect(screen.getByText("New message request")).toBeInTheDocument();
    expect(screen.getByText(/Direct message/i)).toBeInTheDocument();
    expect(screen.getByText("Dana Whitfield")).toBeInTheDocument();
    expect(screen.getByText("@d.whitfield-recruiting")).toBeInTheDocument();
  });

  it("hides the link target until the learner asks", () => {
    render(<SocialDm {...props} />);
    expect(screen.queryByText(props.link)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /where does this link go/i }));
    expect(screen.getByText(props.link)).toBeInTheDocument();
  });

  it("reveals on focus, so a keyboard user gets what a mouse user gets", () => {
    render(<SocialDm {...props} />);
    fireEvent.focus(screen.getByRole("button", { name: /where does this link go/i }));
    expect(screen.getByText(props.link)).toBeInTheDocument();
  });

  it("never renders the link as navigable", () => {
    render(<SocialDm {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /where does this link go/i }));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps the profile collapsed so inspecting it is a deliberate act", () => {
    render(<SocialDm {...props} />);
    expect(screen.queryByText(/connections in common/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /view profile/i }));
    expect(screen.getByText(/connections in common/i)).toBeInTheDocument();
    expect(screen.getByText(/not verified/i)).toBeInTheDocument();
  });

  it("offers no link affordance when the scenario has no link", () => {
    render(<SocialDm {...props} link={null} />);
    expect(
      screen.queryByRole("button", { name: /where does this link go/i }),
    ).not.toBeInTheDocument();
  });
});
