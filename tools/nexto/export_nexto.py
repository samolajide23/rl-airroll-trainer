import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

import numpy as np
import onnx
import onnxruntime as ort
import torch


REVISION = "2e6ed7d6ed2b352e8ff529d4a12a0c9c70c28cca"
ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).resolve().parent / "upstream"
OUTPUT = ROOT / "public" / "bots" / "nexto"


class Policy(torch.nn.Module):
    def __init__(self, actor):
        super().__init__()
        self.actor = actor

    def forward(self, query, entities, mask):
        logits, weights = self.actor((query, entities, mask))
        return logits


def main():
    SOURCE.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    source_hashes = {}
    for name in ("agent.py", "nexto_obs.py", "bot.py", "nexto-model.pt", "LICENSE"):
        remote = "LICENSE" if name == "LICENSE" else f"rlbot-support/Nexto/{name}"
        with urlopen(f"https://raw.githubusercontent.com/Rolv-Arild/Necto/{REVISION}/{remote}") as response:
            content = response.read()
        (SOURCE / name).write_bytes(content)
        source_hashes[name] = hashlib.sha256(content).hexdigest()
    (OUTPUT / "LICENSE").write_bytes((SOURCE / "LICENSE").read_bytes())
    torch.set_num_threads(1)
    actor = torch.jit.load(str(SOURCE / "nexto-model.pt"), map_location="cpu").eval()
    policy = torch.jit.script(Policy(actor).eval())
    generator = np.random.default_rng(42)
    inputs = (
        torch.from_numpy(generator.normal(size=(1, 1, 32)).astype(np.float32)),
        torch.from_numpy(generator.normal(size=(1, 37, 24)).astype(np.float32)),
        torch.zeros((1, 37), dtype=torch.float32),
    )
    model = OUTPUT / "nexto.onnx"
    torch.onnx.export(
        policy, inputs, str(model), input_names=["query", "entities", "mask"],
        output_names=["logits"], opset_version=17, dynamo=False,
    )
    onnx.checker.check_model(onnx.load(str(model)))
    runtime = ort.InferenceSession(str(model), providers=["CPUExecutionProvider"])
    maximum_error = 0.0
    for sample in range(32):
        query = generator.normal(size=(1, 1, 32)).astype(np.float32)
        entities = generator.normal(size=(1, 37, 24)).astype(np.float32)
        mask = np.zeros((1, 37), dtype=np.float32)
        with torch.no_grad():
            expected = policy(torch.from_numpy(query), torch.from_numpy(entities), torch.from_numpy(mask)).numpy()
        actual = runtime.run(None, {"query": query, "entities": entities, "mask": mask})[0]
        np.testing.assert_allclose(actual, expected, rtol=1e-4, atol=1e-4)
        assert np.argmax(actual) == np.argmax(expected), f"Action mismatch on sample {sample}"
        maximum_error = max(maximum_error, float(np.max(np.abs(actual - expected))))
    manifest = {
        "source": "https://github.com/Rolv-Arild/Necto", "revision": REVISION,
        "license": "CC-BY-NC-SA-4.0", "source_sha256": source_hashes,
        "model": "nexto.onnx", "sha256": hashlib.sha256(model.read_bytes()).hexdigest(),
        "inputs": {"query": [1, 1, 32], "entities": [1, 37, 24], "mask": [1, 37]},
        "tick_skip": 8, "validation_samples": 32, "maximum_logit_error": maximum_error,
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()