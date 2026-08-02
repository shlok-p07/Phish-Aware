import { describe, expect, it, afterEach } from "bun:test";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { VectorPreviewToggle } from "./vector-preview-toggle";

afterEach(() => {
  cleanup();
});

describe("VectorPreviewToggle", () => {
  it("shows the email preview by default", () => {
    render(<VectorPreviewToggle />);
    expect(screen.getByText("Simulated inbox")).toBeTruthy();
    expect(screen.queryByText("Simulated message")).toBeNull();
  });

  it("switches to the sms preview when the SMS tab is clicked", () => {
    render(<VectorPreviewToggle />);
    fireEvent.click(screen.getByRole("button", { name: "SMS" }));
    expect(screen.getByText("Simulated message")).toBeTruthy();
    expect(screen.queryByText("Simulated inbox")).toBeNull();
  });

  it("switches back to email when the Email tab is clicked again", () => {
    render(<VectorPreviewToggle />);
    fireEvent.click(screen.getByRole("button", { name: "SMS" }));
    fireEvent.click(screen.getByRole("button", { name: "Email" }));
    expect(screen.getByText("Simulated inbox")).toBeTruthy();
    expect(screen.queryByText("Simulated message")).toBeNull();
  });

  it("switches to the voice preview when the Voice tab is clicked", () => {
    render(<VectorPreviewToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Voice" }));
    expect(screen.getByText("Simulated call")).toBeTruthy();
    expect(screen.queryByText("Simulated inbox")).toBeNull();
  });
});
