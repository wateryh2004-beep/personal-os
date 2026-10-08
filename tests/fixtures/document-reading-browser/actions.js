export async function getReadingProgress() { return (await fetch('/fixture/progress')).json(); }
export async function saveReadingProgress(input) { return (await fetch('/fixture/progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)})).json(); }
