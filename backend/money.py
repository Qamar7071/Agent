"""Money in the Pakistani style: Rs 1,50,000 (lakh grouping). The one place amounts become text."""


def lakh(n: float | int) -> str:
    """1500000 -> '15,00,000'. Whole rupees; the last three digits, then groups of two."""
    value = int(round(n))
    digits = str(abs(value))
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        digits = ",".join(groups) + "," + tail
    return ("-" if value < 0 else "") + digits


def rs(n: float | int) -> str:
    """150000 -> 'Rs 1,50,000'; -500 -> '-Rs 500'."""
    return f"-Rs {lakh(-n)}" if n < 0 else f"Rs {lakh(n)}"


def rs_range(lo: float | int, hi: float | int | None) -> str:
    """'Rs 7,000–18,000', or 'Rs 7,000' when both ends are the same."""
    if hi is None or int(round(hi)) == int(round(lo)):
        return rs(lo)
    return f"Rs {lakh(lo)}–{lakh(hi)}"
