"""The Label Studio labeling config for a bounding-box project."""

from xml.sax.saxutils import quoteattr

FROM_NAME = "label"
TO_NAME = "image"


def build_label_config(labels: list[str]) -> str:
    """`<Image name="image" value="$image">` + one RectangleLabels block.

    `value="$image"` is the task data key; Label Studio maps the source
    storage's blob URL onto it because it is the config's only data key.
    """
    items = "\n".join(f"    <Label value={quoteattr(label)}/>" for label in labels)
    return (
        "<View>\n"
        f'  <Image name="{TO_NAME}" value="$image" zoom="true"/>\n'
        f'  <RectangleLabels name="{FROM_NAME}" toName="{TO_NAME}">\n'
        f"{items}\n"
        "  </RectangleLabels>\n"
        "</View>"
    )
