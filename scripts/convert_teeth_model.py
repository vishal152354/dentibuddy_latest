"""
One-time conversion of the Hugging Face "Good/Bad Teeth" image classifier to ONNX,
so the Node API server can run it with @huggingface/transformers (no Python at runtime).

The 8-bit quantized model (onnx/model_quantized.onnx, ~90 MB) is committed to the repo,
so you only need to run this to regenerate it.

Usage:
    python3 -m venv .venv-model && .venv-model/bin/pip install torch transformers onnx onnxruntime
    .venv-model/bin/python scripts/convert_teeth_model.py

Output:
    server/models/teeth-goodbad/
        config.json
        preprocessor_config.json
        onnx/model.onnx             full precision, ~330 MB (git-ignored)
        onnx/model_quantized.onnx   8-bit, ~90 MB (committed; what the server loads)
"""
import os
import shutil

import torch
from transformers import ViTForImageClassification, ViTImageProcessor

# Set TEETH_MODEL_SRC to a local folder to convert an already-downloaded copy
MODEL_ID = os.environ.get("TEETH_MODEL_SRC", "steven123/Check_GoodBad_Teeth")
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "server", "models", "teeth-goodbad")


def main():
    os.makedirs(os.path.join(OUT_DIR, "onnx"), exist_ok=True)

    model = ViTForImageClassification.from_pretrained(MODEL_ID).eval()
    processor = ViTImageProcessor.from_pretrained(MODEL_ID)

    model.config.save_pretrained(OUT_DIR)
    processor.save_pretrained(OUT_DIR)

    dummy = torch.randn(1, 3, 224, 224)
    torch.onnx.export(
        model,
        (dummy,),
        os.path.join(OUT_DIR, "onnx", "model.onnx"),
        input_names=["pixel_values"],
        output_names=["logits"],
        dynamic_axes={"pixel_values": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=17,
        dynamo=False,
    )

    # 8-bit weights: ~4x smaller so it fits in a normal git repo (GitHub blocks files > 100 MB)
    import numpy as np
    import onnxruntime as ort
    from onnxruntime.quantization import QuantType, quantize_dynamic

    full_path = os.path.join(OUT_DIR, "onnx", "model.onnx")
    quant_path = os.path.join(OUT_DIR, "onnx", "model_quantized.onnx")
    quantize_dynamic(full_path, quant_path, weight_type=QuantType.QUInt8)

    # Sanity check: both ONNX files must agree with PyTorch
    torch_logits = model(pixel_values=dummy).logits.detach().numpy()
    for path in (full_path, quant_path):
        onnx_logits = ort.InferenceSession(path).run(None, {"pixel_values": dummy.numpy()})[0]
        print(os.path.basename(path), "max |onnx - torch| =", float(np.abs(onnx_logits - torch_logits).max()),
              f"({os.path.getsize(path) / 1e6:.0f} MB)")

    # The model card ships two example images; keep them out of the output dir
    shutil.rmtree(os.path.join(OUT_DIR, "images"), ignore_errors=True)
    print("Wrote", os.path.abspath(OUT_DIR), "labels:", model.config.id2label)


if __name__ == "__main__":
    main()
