// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InAppSelect from "./InAppSelect";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const options = [{ value: "", label: "Choose station" }, { value: "a", label: "Alpha" }, { value: "b", label: "Beta" }, { value: "c", label: "Campus" }];
function Picker() {
  const [value, setValue] = useState("a");
  return <><InAppSelect name="station" ariaLabel="Destination station" value={value} onChange={setValue} options={options} /><button>Next control</button></>;
}

describe("passenger in-app selector", () => {
  it("opens page options, selects with a pointer and keeps focus on the trigger", async () => {
    const { container } = render(<Picker />); const user = userEvent.setup();
    const trigger = screen.getByRole("combobox", { name: "Destination station" });
    expect(container.querySelector("select")).toBeNull();
    await user.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("option", { name: "Alpha" }).getAttribute("aria-selected")).toBe("true");
    await user.click(screen.getByRole("option", { name: "Campus" }));
    expect(trigger.textContent).toContain("Campus");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(container.querySelector<HTMLInputElement>('input[name="station"]')?.value).toBe("c");
  });
  it("supports arrows, Home/End, Enter and Space without submitting the containing form", async () => {
    const submit = vi.fn(event => event.preventDefault());
    render(<form onSubmit={submit}><Picker /></form>); const user = userEvent.setup();
    const trigger = screen.getByRole("combobox"); trigger.focus();
    await user.keyboard("{ArrowDown}{End}");
    expect(document.getElementById(trigger.getAttribute("aria-activedescendant")!)?.textContent).toContain("Campus");
    expect(trigger.textContent).toContain("Alpha");
    await user.keyboard("{Enter}");
    expect(trigger.textContent).toContain("Campus");
    await user.keyboard(" {Home}{ArrowDown} ");
    expect(trigger.textContent).toContain("Alpha");
    expect(submit).not.toHaveBeenCalled();
  });
  it("selects a station with a touch tap without losing the pending click on blur", async () => {
    render(<Picker />); const user = userEvent.setup(); const trigger = screen.getByRole("combobox");
    await user.click(trigger);
    await user.pointer([{ keys: "[TouchA>]", target: screen.getByRole("option", { name: "Beta" }) }, { keys: "[/TouchA]" }]);
    expect(trigger.textContent).toContain("Beta");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it("cancels on Escape/outside click and allows Tab to commit and move focus", async () => {
    render(<Picker />); const user = userEvent.setup(); const trigger = screen.getByRole("combobox");
    trigger.focus(); await user.keyboard("{ArrowDown}{End}{Escape}");
    expect(trigger.textContent).toContain("Alpha"); expect(screen.queryByRole("listbox")).toBeNull();
    await user.click(trigger); await user.click(screen.getByRole("button", { name: "Next control" }));
    expect(screen.queryByRole("listbox")).toBeNull(); expect(trigger.textContent).toContain("Alpha");
    trigger.focus(); await user.keyboard("{ArrowDown}{ArrowDown}{Tab}");
    expect(trigger.textContent).toContain("Beta");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Next control" }));
  });
  it("finds stations by typing and scrolls keyboard options into view", async () => {
    const scroll = vi.fn(); Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: scroll });
    render(<Picker />); const user = userEvent.setup(); const trigger = screen.getByRole("combobox");
    trigger.focus(); await user.keyboard("cam{Enter}");
    expect(trigger.textContent).toContain("Campus"); expect(scroll).toHaveBeenCalled();
    delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
  });
  it("cannot open disabled/empty pickers or select a removed live option", async () => {
    const change = vi.fn(); const user = userEvent.setup();
    const props = { name: "bus", ariaLabel: "Live bus", value: "a", onChange: change, options };
    const { rerender } = render(<InAppSelect {...props} disabled />);
    await user.click(screen.getByRole("combobox")); expect(screen.queryByRole("listbox")).toBeNull();
    rerender(<InAppSelect {...props} options={[]} />);
    expect((screen.getByRole("combobox") as HTMLButtonElement).disabled).toBe(true);
    rerender(<InAppSelect {...props} />);
    await user.click(screen.getByRole("combobox"));
    rerender(<InAppSelect {...props} options={[options[2]]} />);
    await user.keyboard("{Enter}");
    expect(change).toHaveBeenCalledWith("b");
    await user.click(screen.getByRole("combobox"));
    rerender(<InAppSelect {...props} disabled />);
    expect(screen.queryByRole("listbox")).toBeNull();
    rerender(<InAppSelect {...props} />);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
  it("fits above a low trigger and closes on viewport changes", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 740, bottom: 784, left: 10, right: 300, width: 290, height: 44, x: 10, y: 740, toJSON: () => ({}) });
    render(<Picker />); const user = userEvent.setup();
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByRole("listbox").className).toContain("bottom-full");
    fireEvent(window, new Event("resize")); expect(screen.queryByRole("listbox")).toBeNull();
  });
});
