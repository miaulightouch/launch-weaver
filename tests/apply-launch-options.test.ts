import { describe, expect, mock, test } from "bun:test";
import { applyLaunchOptionsChange } from "../frontend/apply-launch-options";

function adapter(current: string | null, observed: string | null) {
  return {
    readCurrent: mock(async () => current),
    waitFor: mock(async () => observed),
    write: mock((_value: string) => {}),
  };
}

describe("applyLaunchOptionsChange", () => {
  test("does not write an unchanged value", async () => {
    const io = adapter("A=1 %command%", "A=1 %command%");

    expect(
      await applyLaunchOptionsChange({
        before: "A=1 %command%",
        after: "A=1 %command%",
        io,
      }),
    ).toBe("unchanged");
    expect(io.readCurrent).not.toHaveBeenCalled();
    expect(io.write).not.toHaveBeenCalled();
  });

  test("refuses to overwrite a stale native value", async () => {
    const io = adapter("A=2 %command%", null);

    expect(
      await applyLaunchOptionsChange({
        before: "A=1 %command%",
        after: "A=3 %command%",
        io,
      }),
    ).toBe("stale");
    expect(io.write).not.toHaveBeenCalled();
  });

  test("confirms a successful native write", async () => {
    const io = adapter("A=1 %command%", "A=2 %command%");

    expect(
      await applyLaunchOptionsChange({
        before: "A=1 %command%",
        after: "A=2 %command%",
        io,
      }),
    ).toBe("applied");
    expect(io.write).toHaveBeenCalledTimes(1);
    expect(io.write).toHaveBeenCalledWith("A=2 %command%");
  });

  test("does not make a rollback write when readback does not match", async () => {
    const io = adapter("A=1 %command%", "A=3 %command%");

    expect(
      await applyLaunchOptionsChange({
        before: "A=1 %command%",
        after: "A=2 %command%",
        io,
      }),
    ).toBe("unconfirmed");
    expect(io.write).toHaveBeenCalledTimes(1);
  });

  test("reports an unavailable read without writing", async () => {
    const io = adapter(null, null);

    expect(
      await applyLaunchOptionsChange({ before: "old", after: "new", io }),
    ).toBe("unavailable");
    expect(io.write).not.toHaveBeenCalled();
  });

  test("reports thrown reads and writes without retrying", async () => {
    const readFailure = adapter("old", null);
    readFailure.readCurrent.mockImplementation(async () => {
      throw new Error("read failed");
    });
    expect(await applyLaunchOptionsChange({ before: "old", after: "new", io: readFailure })).toBe(
      "unavailable",
    );
    expect(readFailure.write).not.toHaveBeenCalled();

    const writeFailure = adapter("old", null);
    writeFailure.write.mockImplementation(() => {
      throw new Error("write failed");
    });
    expect(await applyLaunchOptionsChange({ before: "old", after: "new", io: writeFailure })).toBe(
      "failed",
    );
    expect(writeFailure.write).toHaveBeenCalledTimes(1);
  });

  test("reports a thrown readback without making a second write", async () => {
    const io = adapter("old", null);
    io.waitFor.mockImplementation(async () => {
      throw new Error("readback failed");
    });

    expect(await applyLaunchOptionsChange({ before: "old", after: "new", io })).toBe("unconfirmed");
    expect(io.write).toHaveBeenCalledTimes(1);
  });
});
