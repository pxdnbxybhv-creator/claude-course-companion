import torch
from common import MODEL_FILES, load_model
torch.set_num_threads(4)
for name in MODEL_FILES:
    try:
        d = load_model(name)
        n = sum(p.numel() for p in d.model.parameters())
        print(f"{name:28s} arch={d.architecture.name:14s} scale={d.scale} in={d.input_channels} out={d.output_channels} "
              f"params={n/1e6:6.2f}M purpose={d.purpose} size_req={d.size_requirements} tiling={d.tiling} tags={d.tags}")
    except Exception as e:
        print(f"{name:28s} LOAD FAILED: {type(e).__name__}: {str(e)[:300]}")
