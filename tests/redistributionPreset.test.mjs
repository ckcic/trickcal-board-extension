import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { build } from "esbuild";
import { validateRedistributionStage, validateRedistributionStages, exportRedistributionPreset, parseRedistributionPreset, PRESET_TYPE, PRESET_VERSION } from "../src/domain/redistributionPreset.ts";
import { createExampleRedistributionStages } from "../src/domain/hwangRedistribution.ts";

test("단일 단계 유효성 검증 (validateRedistributionStage)", () => {
	// 1. 유효한 황크 단계
	const validHwang = validateRedistributionStage({
		resource: "hwang",
		allowBlocked: false,
		allowGates: true,
		targets: [
			{ stat: "attack", target: 500 },
			{ stat: "hp", target: null },
		],
	});
	assert.ok(validHwang);
	assert.equal(validHwang.resource, "hwang");
	assert.equal(validHwang.allowBlocked, false);
	assert.equal(validHwang.allowGates, true);
	assert.equal(validHwang.targets.length, 2);

	// 2. 유효한 보크 단계
	const validBokr = validateRedistributionStage({
		resource: "bokr",
		boardThrough: 1,
		allowBlocked: true,
		targets: [
			{ stat: "atk_phys", target: 20 },
			{ stat: "def_mag", target: null },
		],
	});
	assert.ok(validBokr);
	assert.equal(validBokr.resource, "bokr");
	assert.equal(validBokr.boardThrough, 1);
	assert.equal(validBokr.allowBlocked, true);

	// 3. 잘못된 스탯 (황크에 atk_phys 직접 지정 등) 거부
	const invalidStatInHwang = validateRedistributionStage({
		resource: "hwang",
		allowBlocked: false,
		targets: [{ stat: "atk_phys", target: 100 }],
	});
	assert.equal(invalidStatInHwang, null);

	// 4. 한 단계 내 중복 스탯 거부
	const duplicateStat = validateRedistributionStage({
		allowBlocked: false,
		targets: [
			{ stat: "attack", target: 500 },
			{ stat: "attack", target: 300 },
		],
	});
	assert.equal(duplicateStat, null);

	// 5. 보크 단계에서 소수점 칸 수 거부
	const floatBokrTarget = validateRedistributionStage({
		resource: "bokr",
		allowBlocked: false,
		targets: [{ stat: "atk_phys", target: 15.5 }],
	});
	assert.equal(floatBokrTarget, null);

	// 6. 황크 단계에 보크 차수 필드 지정 시 거부
	const hwangWithBoardThrough = validateRedistributionStage({
		resource: "hwang",
		boardThrough: 1,
		allowBlocked: false,
		targets: [{ stat: "attack", target: 500 }],
	});
	assert.equal(hwangWithBoardThrough, null);

	// 7. allowBlocked 누락 거부
	const missingAllowBlocked = validateRedistributionStage({
		targets: [{ stat: "attack", target: 500 }],
	});
	assert.equal(missingAllowBlocked, null);
});

test("단계 목록 검증 (validateRedistributionStages)", () => {
	// 빈 배열 거부
	assert.equal(validateRedistributionStages([]), null);

	// 30개 초과 거부
	const tooMany = Array.from({ length: 31 }, () => ({
		allowBlocked: false,
		targets: [{ stat: "attack", target: 100 }],
	}));
	assert.equal(validateRedistributionStages(tooMany), null);

	// 기본 예시 단계(7단계) 통과
	const examples = createExampleRedistributionStages();
	const validated = validateRedistributionStages(examples);
	assert.ok(validated);
	assert.equal(validated.length, 7);
});

test("프리셋 내보내기 및 가져오기 라운드트립 (exportRedistributionPreset & parseRedistributionPreset)", () => {
	const originalStages = [
		{ allowBlocked: false, targets: [{ stat: "attack", target: null }] },
		{
			resource: "bokr",
			boardThrough: 0,
			allowBlocked: true,
			allowGates: true,
			targets: [
				{ stat: "atk_phys", target: 10 },
				{ stat: "crit", target: 5 },
			],
		},
	];

	const exportedJson = exportRedistributionPreset(originalStages);
	assert.ok(typeof exportedJson === "string");

	const parsedRaw = JSON.parse(exportedJson);
	assert.equal(parsedRaw.type, PRESET_TYPE);
	assert.equal(parsedRaw.version, PRESET_VERSION);
	assert.ok(Array.isArray(parsedRaw.stages));
	assert.equal(parsedRaw.stages.length, 2);

	// 개인 설정(재화 등)이 포함되지 않음을 검증
	assert.equal(parsedRaw.owned, undefined);
	assert.equal(parsedRaw.reset, undefined);
	assert.equal(parsedRaw.searchMode, undefined);

	// parseRedistributionPreset으로 복원 검증
	const imported = parseRedistributionPreset(exportedJson);
	assert.ok(imported);
	assert.equal(imported.length, 2);
	assert.equal(imported[0].allowBlocked, false);
	assert.equal(imported[0].targets[0].stat, "attack");
	assert.equal(imported[0].targets[0].target, null);

	assert.equal(imported[1].resource, "bokr");
	assert.equal(imported[1].boardThrough, 0);
	assert.equal(imported[1].allowGates, true);
	assert.equal(imported[1].targets[0].stat, "atk_phys");
	assert.equal(imported[1].targets[0].target, 10);
});

test("잘못되거나 조작된 프리셋 JSON 거부 및 알려진 필드만 수용", () => {
	// 1. 유효하지 않은 JSON 문자열
	assert.equal(parseRedistributionPreset("{ invalid json }"), null);
	assert.equal(parseRedistributionPreset(""), null);

	// 2. 미지원 버전 거부
	assert.equal(
		parseRedistributionPreset(
			JSON.stringify({
				type: PRESET_TYPE,
				version: 999,
				stages: [{ allowBlocked: false, targets: [{ stat: "attack", target: 100 }] }],
			}),
		),
		null,
	);

	// 3. 잘못된 스탯이 섞인 단계 거부
	assert.equal(
		parseRedistributionPreset(
			JSON.stringify({
				type: PRESET_TYPE,
				version: 1,
				stages: [{ allowBlocked: false, targets: [{ stat: "invalid_stat", target: 100 }] }],
			}),
		),
		null,
	);

	// 4. 불필요한 임의 필드가 포함된 경우 알려진 필드만 추출
	const withExtraProps = JSON.stringify({
		type: PRESET_TYPE,
		version: 1,
		stages: [
			{
				allowBlocked: false,
				maliciousField: "ignore_me",
				targets: [{ stat: "attack", target: 500, extra: 123 }],
			},
		],
	});
	const parsed = parseRedistributionPreset(withExtraProps);
	assert.ok(parsed);
	assert.equal(parsed[0].maliciousField, undefined);
	assert.equal(parsed[0].targets[0].extra, undefined);
});

test("순수 stages 배열 형태의 입력도 유연하게 파싱", () => {
	const arrayJson = JSON.stringify([{ allowBlocked: true, targets: [{ stat: "crit", target: 500 }] }]);
	const parsed = parseRedistributionPreset(arrayJson);
	assert.ok(parsed);
	assert.equal(parsed.length, 1);
	assert.equal(parsed[0].targets[0].stat, "crit");
});

test("프리셋 내보내기/가져오기 모달 UI는 클립보드 복사·붙여넣기, 파일 다운로드·드롭 및 실시간 검증을 처리한다", async () => {
	const presetUiBundle = await build({
		entryPoints: ["src/ui/redistribution/redistributionPresetModal.ts"],
		bundle: true,
		write: false,
		format: "iife",
		globalName: "presetModalMod",
	});

	const makeEl = () => {
		const listeners = new Map();
		const classes = new Set();
		return {
			className: "",
			innerHTML: "",
			textContent: "",
			value: "",
			files: [],
			href: "",
			download: "",
			selected: false,
			clicked: false,
			removed: false,
			classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
			addEventListener: (type, fn) => listeners.set(type, fn),
			trigger: (type, ev = {}) => listeners.get(type)?.({ preventDefault() {}, ...ev }),
			select() {
				this.selected = true;
			},
			focus() {},
			click() {
				this.clicked = true;
			},
			remove() {
				this.removed = true;
			},
		};
	};

	let clipboardText = "";
	let clipFail = false;
	let createdAnchor = null;
	let overlayEl = null;
	let textareaEl = null;
	let statusEl = null;
	let copyBtn = null;
	let downloadBtn = null;
	let pasteBtn = null;
	let selectFileBtn = null;
	let fileInput = null;
	let applyBtn = null;
	let closeBtn = null;
	const docListeners = new Map();

	class FakeFileReader {
		readAsText(file) {
			this.result = file.content;
			this.onload?.();
		}
	}

	const parentDialog = {
		appendChild(el) {
			overlayEl = el;
		},
	};
	const context = vm.createContext({
		Blob: class {
			constructor(parts) {
				this.parts = parts;
			}
		},
		URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
		FileReader: FakeFileReader,
		navigator: {
			clipboard: {
				writeText: async (t) => {
					if (clipFail) throw new Error("blocked");
					clipboardText = t;
				},
				readText: async () => {
					if (clipFail) throw new Error("blocked");
					return clipboardText;
				},
			},
		},
		setTimeout: (fn) => {
			fn();
			return 1;
		},
		document: {
			addEventListener: (t, fn) => docListeners.set(t, fn),
			removeEventListener: (t) => docListeners.delete(t),
			createElement: (tag) => {
				if (tag === "a") {
					createdAnchor = makeEl();
					return createdAnchor;
				}
				const el = makeEl();
				textareaEl = makeEl();
				statusEl = makeEl();
				copyBtn = makeEl();
				downloadBtn = makeEl();
				pasteBtn = makeEl();
				selectFileBtn = makeEl();
				fileInput = makeEl();
				applyBtn = makeEl();
				closeBtn = makeEl();
				el.querySelector = (sel) => {
					if (sel === "textarea") return textareaEl;
					if (sel === "[data-status]") return statusEl;
					if (sel === "[data-copy-preset]") return copyBtn;
					if (sel === "[data-download-preset]") return downloadBtn;
					if (sel === "[data-paste-clipboard]") return pasteBtn;
					if (sel === "[data-select-file]") return selectFileBtn;
					if (sel === "[data-file-input]") return fileInput;
					if (sel === "[data-apply-preset]") return applyBtn;
					return null;
				};
				el.querySelectorAll = () => [closeBtn];
				return el;
			},
		},
	});
	vm.runInContext(presetUiBundle.outputFiles[0].text, context);

	const stages = [{ allowBlocked: false, targets: [{ stat: "attack", target: 300 }] }];

	// 1. 내보내기 모달: 클립보드 복사 성공/실패 및 파일 다운로드
	context.presetModalMod.openExportPresetModal(parentDialog, stages);
	await copyBtn.trigger("click");
	assert.ok(clipboardText.includes(PRESET_TYPE));
	assert.ok(statusEl.textContent.includes("복사되었습니다"));

	clipFail = true;
	await copyBtn.trigger("click");
	assert.equal(textareaEl.selected, true);
	assert.ok(statusEl.textContent.includes("차단"));

	downloadBtn.trigger("click");
	assert.equal(createdAnchor.clicked, true);
	assert.match(createdAnchor.download, /^tcbe_preset_\d{8}\.json$/);
	docListeners.get("keydown")?.({ key: "Escape", preventDefault() {} });
	assert.equal(overlayEl.removed, true);

	// 2. 가져오기 모달: 클립보드 붙여넣기, 드래그 앤 드롭 파일 로드 및 적용
	clipFail = false;
	let importedStages = null;
	context.presetModalMod.openImportPresetModal(parentDialog, (res) => {
		importedStages = res;
	});

	textareaEl.value = "{ invalid";
	textareaEl.trigger("input");
	assert.ok(statusEl.textContent.includes("올바른 단계 설정 JSON 형식이 아니거나"));

	await pasteBtn.trigger("click");
	assert.ok(statusEl.textContent.includes("유효한 설정입니다"));

	// 드래그 앤 드롭으로 새 단계 로드 후 적용
	const dropJson = exportRedistributionPreset([{ allowBlocked: true, targets: [{ stat: "hp", target: 240 }] }]);
	textareaEl.trigger("drop", { dataTransfer: { files: [{ content: dropJson }] } });
	applyBtn.trigger("click");
	assert.equal(importedStages?.length, 1);
	assert.equal(importedStages[0].targets[0].stat, "hp");
	assert.equal(overlayEl.removed, true);
});
